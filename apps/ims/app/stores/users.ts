import { defineStore } from "pinia";
import type { StaffUser, UserCreatePayload, UserUpdatePayload } from "~/types/user";

export const useUserStore = defineStore("users", {
  state: () => ({
    items: [] as StaffUser[],
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
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load staff.";
      } finally {
        this.isLoading = false;
      }
    },

    async createUser(payload: UserCreatePayload, token: string) {
      const { createUser } = useApi();
      await createUser(payload, token);
      await this.fetchUsers(token);
    },

    async updateUser(id: string, payload: UserUpdatePayload, token: string) {
      const { updateUser } = useApi();
      await updateUser(id, payload, token);
      await this.fetchUsers(token);
    },
  },
});
