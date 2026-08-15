<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { StaffUser, UserRole } from "~/types/user";

const props = defineProps<{
  user: StaffUser | null;
}>();

const open = defineModel<boolean>("open", { default: false });

const auth = useAuth();
const store = useUserStore();

const ROLES: UserRole[] = ["CASHIER", "BARISTA", "MANAGER", "ADMIN"];
const PIN_PATTERN = /^\d{4}$/;

const name = ref("");
const pin = ref("");
const role = ref<UserRole>("CASHIER");
const isActive = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

const isEditMode = computed(() => props.user !== null);

const nameError = computed(() => (name.value.trim().length === 0 ? "Name is required" : null));

const pinError = computed(() => {
  // A blank PIN is only valid when editing an existing account - it means
  // "leave the current PIN unchanged". Creating an account always requires one.
  if (isEditMode.value && pin.value.trim().length === 0) {
    return null;
  }
  return PIN_PATTERN.test(pin.value) ? null : "PIN must be exactly 4 digits";
});

const canSubmit = computed(() => !nameError.value && !pinError.value && !isSubmitting.value);

watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }

  errorMessage.value = null;

  if (props.user) {
    name.value = props.user.name;
    pin.value = "";
    role.value = props.user.role;
    isActive.value = props.user.isActive;
  } else {
    name.value = "";
    pin.value = "";
    role.value = "CASHIER";
    isActive.value = true;
  }
});

function close() {
  open.value = false;
}

async function submit() {
  if (!canSubmit.value) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    errorMessage.value = "Your session has expired. Please sign in again.";
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = null;

  try {
    if (props.user) {
      await store.updateUser(
        props.user.id,
        {
          name: name.value.trim(),
          role: role.value,
          isActive: isActive.value,
          pin: pin.value.trim() || undefined,
        },
        token,
      );
    } else {
      await store.createUser(
        {
          name: name.value.trim(),
          pin: pin.value.trim(),
          role: role.value,
          isActive: isActive.value,
        },
        token,
      );
    }
    open.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Failed to save staff account.";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
      <h2 class="text-lg font-bold text-slate-900">{{ isEditMode ? "Edit Staff Member" : "New Staff Member" }}</h2>

      <div class="mt-4">
        <label class="block text-sm font-medium text-slate-700">Name</label>
        <input
          v-model="name"
          type="text"
          placeholder="e.g. Jamie Rivera"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      <div class="mt-4">
        <label class="block text-sm font-medium text-slate-700">
          PIN {{ isEditMode ? "(leave blank to keep current PIN)" : "" }}
        </label>
        <input
          v-model="pin"
          type="password"
          inputmode="numeric"
          maxlength="4"
          placeholder="4 digits"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tracking-widest focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <p v-if="pin.length > 0 && pinError" class="mt-1 text-xs font-medium text-red-600">{{ pinError }}</p>
      </div>

      <div class="mt-4">
        <label class="block text-sm font-medium text-slate-700">Role</label>
        <select
          v-model="role"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option v-for="option in ROLES" :key="option" :value="option">{{ option }}</option>
        </select>
      </div>

      <div class="mt-4 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
        <span class="text-sm font-medium text-slate-700">Active</span>
        <button
          type="button"
          role="switch"
          :aria-checked="isActive"
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          :class="isActive ? 'bg-emerald-500' : 'bg-slate-300'"
          @click="isActive = !isActive"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
            :class="isActive ? 'translate-x-6' : 'translate-x-1'"
          />
        </button>
      </div>

      <p v-if="errorMessage" class="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
        {{ errorMessage }}
      </p>

      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          @click="close"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="!canSubmit"
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          @click="submit"
        >
          {{ isSubmitting ? "Saving..." : isEditMode ? "Save Changes" : "Create Staff Member" }}
        </button>
      </div>
    </div>
  </div>
</template>
