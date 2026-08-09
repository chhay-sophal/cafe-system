<script setup lang="ts">
import { ref } from "vue";

const auth = useAuth();

const pin = ref("");
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

async function submit() {
  if (pin.value.trim().length === 0 || isSubmitting.value) {
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = null;

  try {
    await auth.login(pin.value.trim());
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Login failed.";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-slate-100">
    <form class="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg" @submit.prevent="submit">
      <h1 class="text-xl font-bold text-slate-900">Inventory Manager</h1>
      <p class="mt-1 text-sm text-slate-500">Sign in with your manager PIN</p>

      <label for="pin" class="mt-6 block text-sm font-medium text-slate-700">PIN</label>
      <input
        id="pin"
        v-model="pin"
        type="password"
        inputmode="numeric"
        autocomplete="off"
        class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-lg tracking-widest focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        placeholder="••••"
      />

      <p v-if="errorMessage" class="mt-3 text-sm font-medium text-red-600">{{ errorMessage }}</p>

      <button
        type="submit"
        :disabled="pin.trim().length === 0 || isSubmitting"
        class="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {{ isSubmitting ? "Signing in..." : "Sign In" }}
      </button>
    </form>
  </div>
</template>
