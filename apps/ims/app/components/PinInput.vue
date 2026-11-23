<script setup lang="ts">
import { nextTick, ref } from "vue";
import { Eye, EyeOff } from "@lucide/vue";
import { toWesternDigits } from "~/utils/numericInput";

// Every staff PIN is exactly this many digits (enforced by the backend's
// user schemas and the create-admin script).
const PIN_LENGTH = 4;

defineProps<{
  id?: string;
  placeholder?: string;
  // Sizing/typography for the field itself, which differs between the login
  // screen and the staff form.
  inputClass?: string;
}>();

const pin = defineModel<string>({ required: true });

const { t } = useI18n();
const isVisible = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

// Digits only (Khmer digits converted), capped at the PIN length - so a
// pasted or over-typed value can't hold more than a PIN can be.
async function handleInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const digits = toWesternDigits(input.value).replace(/\D/g, "").slice(0, PIN_LENGTH);
  pin.value = digits;
  // If the model didn't change (e.g. a letter typed into "12"), Vue won't
  // re-render, so put the cleaned value back in the field by hand.
  await nextTick();
  if (input.value !== digits) {
    input.value = digits;
  }
}

function toggleVisibility() {
  isVisible.value = !isVisible.value;
  inputRef.value?.focus();
}
</script>

<template>
  <div class="relative">
    <input
      :id="id"
      ref="inputRef"
      :value="pin"
      :type="isVisible ? 'text' : 'password'"
      inputmode="numeric"
      pattern="[0-9]*"
      autocomplete="off"
      :maxlength="PIN_LENGTH"
      :placeholder="placeholder"
      class="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-11 tracking-widest focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      :class="inputClass"
      @input="handleInput"
    />
    <button
      type="button"
      class="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-700 focus:text-slate-700 focus:outline-none"
      :aria-label="isVisible ? t('common.hidePin') : t('common.showPin')"
      :aria-pressed="isVisible"
      :title="isVisible ? t('common.hidePin') : t('common.showPin')"
      @mousedown.prevent
      @click="toggleVisibility"
    >
      <EyeOff v-if="isVisible" class="h-5 w-5" aria-hidden="true" />
      <Eye v-else class="h-5 w-5" aria-hidden="true" />
    </button>
  </div>
</template>
