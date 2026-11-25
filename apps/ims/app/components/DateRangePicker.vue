<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, watch } from "vue";
import { CalendarDays, ChevronLeft, ChevronRight } from "@lucide/vue";

const { t, locale } = useI18n();
const store = useSalesPeriodStore();

const isOpen = ref(false);
// Picking your own dates: one day, or a range from-to.
type CustomMode = "day" | "range";
const customMode = ref<CustomMode>("day");
const customDay = ref(store.startDate);
const customStart = ref(store.startDate);
const customEnd = ref(store.endDate);

// Wide enough for the two range date inputs side by side.
const MENU_WIDTH_PX = 320;
const VIEWPORT_MARGIN_PX = 8;
const MENU_GAP_PX = 8;

const triggerButton = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLDivElement | null>(null);
const panelStyle = ref<Record<string, string>>({});

// Recomputed each time it's read, so a picker left open past midnight
// still knows what "today" is.
const todayString = () => formatDateLocal(new Date());

type PresetKey = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth";

// Days first, then ranges ending today, then whole months - in pairs, as
// the panel lays them out in two columns.
function presetRange(key: PresetKey): { startDate: string; endDate: string } {
  const today = new Date();
  const day = (offset: number) => formatDateLocal(addDays(today, offset));
  switch (key) {
    case "today":
      return { startDate: day(0), endDate: day(0) };
    case "yesterday":
      return { startDate: day(-1), endDate: day(-1) };
    case "last7":
      return { startDate: day(-6), endDate: day(0) };
    case "last30":
      return { startDate: day(-29), endDate: day(0) };
    case "thisMonth":
      return { startDate: formatDateLocal(startOfMonth(today)), endDate: day(0) };
    case "lastMonth": {
      const lastMonthEnd = addDays(startOfMonth(today), -1);
      return { startDate: formatDateLocal(startOfMonth(lastMonthEnd)), endDate: formatDateLocal(lastMonthEnd) };
    }
  }
}

const PRESET_KEYS: PresetKey[] = ["today", "yesterday", "last7", "last30", "thisMonth", "lastMonth"];
const PRESET_LABEL: Record<PresetKey, string> = {
  today: "dateRange.today",
  yesterday: "dateRange.yesterday",
  last7: "dateRange.last7Days",
  last30: "dateRange.last30Days",
  thisMonth: "dateRange.thisMonth",
  lastMonth: "dateRange.lastMonth",
};

const activePreset = computed<PresetKey | null>(
  () =>
    PRESET_KEYS.find((key) => {
      const range = presetRange(key);
      return range.startDate === store.startDate && range.endDate === store.endDate;
    }) ?? null,
);

// "Today", "Yesterday", "This month", a whole month by name ("October
// 2026"), one day's date, or from - to.
const rangeLabel = computed(() => {
  const preset = activePreset.value;
  if (preset === "today" || preset === "yesterday" || preset === "thisMonth") {
    return t(PRESET_LABEL[preset]);
  }
  const start = parseDateLocal(store.startDate);
  if (start.getDate() === 1 && store.endDate === formatDateLocal(endOfMonth(start))) {
    return formatMonthLabel(store.startDate, locale.value);
  }
  if (store.startDate === store.endDate) {
    return formatDateLabel(store.startDate, locale.value);
  }
  return `${formatDateLabel(store.startDate, locale.value)} – ${formatDateLabel(store.endDate, locale.value)}`;
});

function applyPreset(key: PresetKey) {
  const range = presetRange(key);
  store.setDateRange(range.startDate, range.endDate);
  isOpen.value = false;
}

// The arrows beside the button: the same length of time before or after
// (a day, a week, a calendar month...), never past today.
const previousPeriod = computed(() => shiftPeriod(store.startDate, store.endDate, -1, todayString()));
const nextPeriod = computed(() => shiftPeriod(store.startDate, store.endDate, 1, todayString()));

function stepPeriod(direction: 1 | -1) {
  const target = direction === 1 ? nextPeriod.value : previousPeriod.value;
  if (target) {
    store.setDateRange(target.startDate, target.endDate);
  }
}

// One day applies as soon as it's picked - nothing else to fill in.
function applyCustomDay() {
  if (!customDay.value || customDay.value > todayString()) {
    return;
  }
  store.setDateRange(customDay.value, customDay.value);
  isOpen.value = false;
}

const canApplyRange = computed(() => Boolean(customStart.value && customEnd.value));

function applyCustomRange() {
  if (!canApplyRange.value) {
    return;
  }
  const [start, end] = customStart.value <= customEnd.value
    ? [customStart.value, customEnd.value]
    : [customEnd.value, customStart.value];
  store.setDateRange(start, end);
  isOpen.value = false;
}

// The panel is teleported to <body> and positioned against the viewport, so
// a scrolling ancestor (the page's <main> is overflow-y-auto) can't crop it.
// Placed below the trigger - or above, when there's more room there - and
// kept fully on-screen, capped to the space available (scrolling inside).
function positionPanel() {
  const rect = triggerButton.value?.getBoundingClientRect();
  if (!rect) {
    return;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(MENU_WIDTH_PX, viewportWidth - VIEWPORT_MARGIN_PX * 2);
  // Left-aligned with the trigger if that fits, otherwise right-aligned.
  const preferredLeft = rect.left + width <= viewportWidth - VIEWPORT_MARGIN_PX ? rect.left : rect.right - width;
  const left = Math.min(Math.max(preferredLeft, VIEWPORT_MARGIN_PX), viewportWidth - width - VIEWPORT_MARGIN_PX);

  const panelHeight = panel.value?.scrollHeight ?? 0;
  const spaceBelow = viewportHeight - rect.bottom - MENU_GAP_PX - VIEWPORT_MARGIN_PX;
  const spaceAbove = rect.top - MENU_GAP_PX - VIEWPORT_MARGIN_PX;
  const openUpward = panelHeight > spaceBelow && spaceAbove > spaceBelow;
  const maxHeight = openUpward ? spaceAbove : spaceBelow;
  const top = openUpward
    ? rect.top - MENU_GAP_PX - Math.min(panelHeight, spaceAbove)
    : rect.bottom + MENU_GAP_PX;

  panelStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${maxHeight}px`,
  };
}

async function toggleOpen() {
  if (isOpen.value) {
    isOpen.value = false;
    return;
  }

  // Opens on what's showing: a single day in the day picker, a range in the
  // range one.
  customMode.value = store.startDate === store.endDate ? "day" : "range";
  customDay.value = store.startDate;
  customStart.value = store.startDate;
  customEnd.value = store.endDate;
  positionPanel();
  isOpen.value = true;
  // Again once rendered, now that the panel's height can be measured.
  await nextTick();
  positionPanel();
}

// Scrolling the page would leave the fixed panel behind its trigger, so close
// it - unless the scroll is inside the panel itself.
function handleScroll(event: Event) {
  if (event.target instanceof Node && panel.value?.contains(event.target)) {
    return;
  }
  isOpen.value = false;
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    isOpen.value = false;
    triggerButton.value?.focus();
  }
}

function removeListeners() {
  window.removeEventListener("scroll", handleScroll, true);
  window.removeEventListener("resize", positionPanel);
  window.removeEventListener("keydown", handleKeydown);
}

watch(isOpen, (open) => {
  removeListeners();
  if (open) {
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", positionPanel);
    window.addEventListener("keydown", handleKeydown);
  }
});

onBeforeUnmount(removeListeners);
// Its page is kept alive when another page opens (app.vue) - don't leave
// the menu, which lives in <body>, open over that page.
onDeactivated(() => {
  isOpen.value = false;
});
</script>

<template>
  <div class="relative inline-flex">
    <!-- ‹ [period ▾] › - the arrows step to the period before / after. -->
    <div class="flex overflow-hidden rounded-lg border border-slate-300 bg-white">
      <button
        type="button"
        class="px-2.5 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
        :disabled="!previousPeriod"
        :title="$t('dateRange.previous')"
        :aria-label="$t('dateRange.previous')"
        @click="stepPeriod(-1)"
      >
        <ChevronLeft class="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        ref="triggerButton"
        type="button"
        class="flex items-center gap-2 border-x border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        :aria-expanded="isOpen"
        aria-haspopup="dialog"
        @click="toggleOpen"
      >
        <CalendarDays class="h-4 w-4 text-slate-400" aria-hidden="true" />
        {{ rangeLabel }}
        <span class="text-slate-400">&#9662;</span>
      </button>
      <button
        type="button"
        class="px-2.5 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
        :disabled="!nextPeriod"
        :title="$t('dateRange.next')"
        :aria-label="$t('dateRange.next')"
        @click="stepPeriod(1)"
      >
        <ChevronRight class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>

    <Teleport to="body">
      <div v-if="isOpen" class="fixed inset-0 z-40" @click="isOpen = false" />

      <div
        v-if="isOpen"
        ref="panel"
        role="dialog"
        :aria-label="$t('dateRange.chooseDates')"
        class="fixed z-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        :style="panelStyle"
      >
        <div class="grid grid-cols-2 gap-1.5 p-3">
          <button
            v-for="key in PRESET_KEYS"
            :key="key"
            type="button"
            class="rounded-lg border px-3 py-2 text-left text-sm font-medium transition"
            :class="activePreset === key
              ? 'border-primary bg-primary text-white'
              : 'border-slate-200 text-slate-700 hover:bg-slate-50'"
            :aria-pressed="activePreset === key"
            @click="applyPreset(key)"
          >
            {{ $t(PRESET_LABEL[key]) }}
          </button>
        </div>

        <div class="border-t border-slate-200 p-3">
          <div class="mb-3 flex overflow-hidden rounded-lg border border-slate-300" role="group" :aria-label="$t('dateRange.chooseDates')">
            <button
              v-for="mode in (['day', 'range'] as const)"
              :key="mode"
              type="button"
              class="flex-1 px-3 py-1.5 text-xs font-semibold transition"
              :class="customMode === mode ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'"
              :aria-pressed="customMode === mode"
              @click="customMode = mode"
            >
              {{ mode === "day" ? $t("dateRange.singleDay") : $t("dateRange.dateRange") }}
            </button>
          </div>

          <template v-if="customMode === 'day'">
            <label class="block text-xs font-medium text-slate-500" for="date-picker-day">{{ $t("dateRange.day") }}</label>
            <input
              id="date-picker-day"
              v-model="customDay"
              type="date"
              :max="todayString()"
              class="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              @change="applyCustomDay"
            />
          </template>

          <template v-else>
            <div class="grid grid-cols-2 gap-2">
              <div class="min-w-0">
                <label class="block text-xs font-medium text-slate-500" for="date-picker-from">{{ $t("dateRange.from") }}</label>
                <input
                  id="date-picker-from"
                  v-model="customStart"
                  type="date"
                  :max="customEnd || todayString()"
                  class="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
              <div class="min-w-0">
                <label class="block text-xs font-medium text-slate-500" for="date-picker-to">{{ $t("dateRange.to") }}</label>
                <input
                  id="date-picker-to"
                  v-model="customEnd"
                  type="date"
                  :min="customStart || undefined"
                  :max="todayString()"
                  class="mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>
            </div>
            <button
              type="button"
              class="mt-3 w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!canApplyRange"
              @click="applyCustomRange"
            >
              {{ $t("dateRange.apply") }}
            </button>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>
