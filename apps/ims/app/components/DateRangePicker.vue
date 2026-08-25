<script setup lang="ts">
import { computed, ref } from "vue";

const { t } = useI18n();
const store = useReportsStore();

const isOpen = ref(false);
const customStart = ref(store.startDate);
const customEnd = ref(store.endDate);

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
    return activePreset.value === "today" ? t("dateRange.today") : formatDateLabel(store.startDate);
  }
  return `${formatDateLabel(store.startDate)} – ${formatDateLabel(store.endDate)}`;
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

function toggleOpen() {
  if (!isOpen.value) {
    customStart.value = store.startDate;
    customEnd.value = store.endDate;
  }
  isOpen.value = !isOpen.value;
}
</script>

<template>
  <div class="relative inline-block">
    <button
      type="button"
      class="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      @click="toggleOpen"
    >
      {{ rangeLabel }}
      <span class="text-slate-400">&#9662;</span>
    </button>

    <div v-if="isOpen" class="fixed inset-0 z-10" @click="isOpen = false" />

    <div
      v-if="isOpen"
      class="absolute left-0 z-20 mt-2 w-72 rounded-lg border border-slate-200 bg-white shadow-lg"
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
            class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <span class="text-slate-400">-</span>
          <input
            v-model="customEnd"
            type="date"
            class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <button
          type="button"
          class="mt-3 w-full rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          @click="applyCustomRange"
        >
          {{ $t("dateRange.apply") }}
        </button>
      </div>
    </div>
  </div>
</template>
