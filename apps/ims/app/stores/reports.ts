import { defineStore } from "pinia";
import type { DailySummaryReport } from "~/types/reports";

export const useReportsStore = defineStore("reports", {
  state: () => ({
    report: null as DailySummaryReport | null,
    // The period (see useSalesPeriodStore) `report` was loaded for.
    loadedRange: null as string | null,
    loadedAt: null as number | null,
    isLoading: false,
    hasLoadedOnce: false,
    error: null as string | null,
  }),

  actions: {
    async fetchReport() {
      const { fetchDailySummary } = useApi();
      const { startDate, endDate } = useSalesPeriodStore();
      this.isLoading = true;
      this.error = null;

      try {
        this.report = await fetchDailySummary(startDate, endDate, useAuth().requireToken());
        this.loadedRange = `${startDate}..${endDate}`;
        this.loadedAt = Date.now();
        this.hasLoadedOnce = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load report.";
      } finally {
        this.isLoading = false;
      }
    },

    // On opening Analytics: load unless the report already covers the current
    // period (which may have changed on Sales History meanwhile) and is recent
    // - the POS keeps adding sales (utils/cache.ts).
    loadIfStale() {
      const { startDate, endDate } = useSalesPeriodStore();
      if (this.loadedRange !== `${startDate}..${endDate}` || !isFresh(this.loadedAt, SHARED_DATA_MAX_AGE_MS)) {
        this.fetchReport();
      }
    },
  },
});
