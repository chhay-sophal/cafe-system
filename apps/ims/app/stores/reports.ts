import { defineStore } from "pinia";
import type { DailySummaryReport } from "~/types/reports";

export const useReportsStore = defineStore("reports", {
  state: () => {
    const today = formatDateLocal(new Date());
    return {
      startDate: today,
      endDate: today,
      report: null as DailySummaryReport | null,
      isLoading: false,
      hasLoadedOnce: false,
      error: null as string | null,
    };
  },

  actions: {
    async fetchReport() {
      const { fetchDailySummary } = useApi();
      this.isLoading = true;
      this.error = null;

      try {
        this.report = await fetchDailySummary(this.startDate, this.endDate);
        this.hasLoadedOnce = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load report.";
      } finally {
        this.isLoading = false;
      }
    },

    setDateRange(startDate: string, endDate: string) {
      this.startDate = startDate;
      this.endDate = endDate;
      this.fetchReport();
    },
  },
});
