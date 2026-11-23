<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

const { t, locale } = useI18n();
const store = useSalesPeriodStore();

const isOpen = ref(false);
const customStart = ref(store.startDate);
const customEnd = ref(store.endDate);

// Wide enough for the two custom-range date inputs side by side.
const MENU_WIDTH_PX = 320;
const VIEWPORT_MARGIN_PX = 8;
const MENU_GAP_PX = 8;

const triggerButton = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLDivElement | null>(null);
const panelStyle = ref<Record<string, string>>({});

type PresetKey = "today" | "last7" | "last30" | "mtd";

const presets = computed<Array<{ key: PresetKey; label: string }>>(() => [
  { key: "today", label: t("dateRange.today") },
  { key: "last7", label: t("dateRange.last7Days") },
  { key: "last30", label: t("dateRange.last30Days") },
  { key: "mtd", label: t("dateRange.monthToDate") },
]);

const activePreset = computed<PresetKey | null>(() => {
  const today = formatDateLocal(new Date());
  if (store.startDate === today && store.endDate === today) {
    return "today";
  }
  if (store.endDate === today && store.startDate === formatDateLocal(addDays(new Date(), -6))) {
    return "last7";
  }
  if (store.endDate === today && store.startDate === formatDateLocal(addDays(new Date(), -29))) {
    return "last30";
  }
  if (store.endDate === today && store.startDate === formatDateLocal(startOfMonth(new Date()))) {
    return "mtd";
  }
  return null;
});

const rangeLabel = computed(() => {
  if (store.startDate === store.endDate) {
    return activePreset.value === "today" ? t("dateRange.today") : formatDateLabel(store.startDate, locale.value);
  }
  return `${formatDateLabel(store.startDate, locale.value)} – ${formatDateLabel(store.endDate, locale.value)}`;
});

function applyPreset(key: PresetKey) {
  const today = new Date();
  if (key === "today") {
    const value = formatDateLocal(today);
    store.setDateRange(value, value);
  } else if (key === "last7") {
    store.setDateRange(formatDateLocal(addDays(today, -6)), formatDateLocal(today));
  } else if (key === "last30") {
    store.setDateRange(formatDateLocal(addDays(today, -29)), formatDateLocal(today));
  } else {
    store.setDateRange(formatDateLocal(startOfMonth(today)), formatDateLocal(today));
  }
  isOpen.value = false;
}

function applyCustomRange() {
  if (!customStart.value || !customEnd.value) {
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
</script>

<template>
  <div class="relative inline-block">
    <button
      ref="triggerButton"
      type="button"
      class="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      @click="toggleOpen"
    >
      {{ rangeLabel }}
      <span class="text-slate-400">&#9662;</span>
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="fixed inset-0 z-40" @click="isOpen = false" />

      <div
        v-if="isOpen"
        ref="panel"
        class="fixed z-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        :style="panelStyle"
      >
        <div class="p-2">
          <button
            v-for="preset in presets"
            :key="preset.key"
            type="button"
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"
            @click="applyPreset(preset.key)"
          >
            <span class="text-slate-700">{{ preset.label }}</span>
            <span v-if="activePreset === preset.key" class="text-base font-bold text-slate-900">&#10003;</span>
          </button>
        </div>

        <div class="border-t border-slate-200 p-3">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{{ $t("dateRange.customRange") }}</p>
          <div class="flex items-center gap-2">
            <input
              v-model="customStart"
              type="date"
              class="w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <span class="text-slate-400">-</span>
            <input
              v-model="customEnd"
              type="date"
              class="w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <button
            type="button"
            class="mt-3 w-full rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover"
            @click="applyCustomRange"
          >
            {{ $t("dateRange.apply") }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
