import { defineStore } from "pinia";

// The date range picked on the Analytics and Sales History pages - shared, so
// switching between them keeps looking at the same period. Each page loads
// its own data for it.
export const useSalesPeriodStore = defineStore("salesPeriod", {
  state: () => {
    const today = formatDateLocal(new Date());
    return {
      startDate: today,
      endDate: today,
    };
  },

  actions: {
    setDateRange(startDate: string, endDate: string) {
      this.startDate = startDate;
      this.endDate = endDate;
    },
  },
});
