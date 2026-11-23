import { defineStore } from "pinia";
import type { PosSettings, PosSettingsResponse } from "~/types/settings";

export const usePosSettingsStore = defineStore("posSettings", {
  state: () => ({
    response: null as PosSettingsResponse | null,
    isLoading: false,
    error: null as string | null,
  }),

  actions: {
    async fetch() {
      const { fetchPosSettings } = useApi();
      this.isLoading = true;
      this.error = null;
      try {
        this.response = await fetchPosSettings();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load POS settings.";
      } finally {
        this.isLoading = false;
      }
    },

    // One section at a time, so a change made on the register meanwhile to
    // another section isn't overwritten. Errors go to the caller's form.
    async save(update: Partial<PosSettings>) {
      const { savePosSettings } = useApi();
      this.response = await savePosSettings(update, useAuth().requireToken());
    },
  },
});
