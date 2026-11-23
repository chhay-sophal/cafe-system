import { defineStore } from "pinia";
import type { StaffUser, UserCreatePayload, UserUpdatePayload } from "~/types/user";

export const useUserStore = defineStore("users", {
  state: () => ({
    items: [] as StaffUser[],
    loadedAt: null as number | null,
    isLoading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchUsers(token: string) {
      const { fetchUsers } = useApi();
      this.isLoading = true;
      this.error = null;

      try {
        this.items = await fetchUsers(token);
        this.loadedAt = Date.now();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load staff.";
      } finally {
        this.isLoading = false;
      }
    },

    // Staff only change here, so once per session (see utils/cache.ts).
    async ensureLoaded(token: string) {
      if (!isFresh(this.loadedAt)) {
        await this.fetchUsers(token);
      }
    },

    // From the save's response rather than reloading the whole staff list.
    async createUser(payload: UserCreatePayload, token: string) {
      const { createUser } = useApi();
      this.items = [...this.items, await createUser(payload, token)];
    },

    async updateUser(id: string, payload: UserUpdatePayload, token: string) {
      const { updateUser } = useApi();
      const updated = await updateUser(id, payload, token);
      this.items = this.items.map((user) => (user.id === id ? updated : user));
    },
  },
});
