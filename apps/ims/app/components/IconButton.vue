<script setup lang="ts">
import type { Component } from "vue";

// Icon-only row action. `label` is the action word ("Edit", "Delete"...):
// shown as the hover tooltip and read out by screen readers, since there's
// no visible text.
withDefaults(
  defineProps<{
    icon: Component;
    label: string;
    variant?: "default" | "danger" | "primary";
    disabled?: boolean;
  }>(),
  { variant: "default", disabled: false },
);

const VARIANT_CLASS = {
  default: "border border-slate-300 text-slate-700 hover:bg-slate-100",
  danger: "border border-red-200 text-red-600 hover:bg-red-50",
  primary: "bg-primary text-white hover:bg-primary-hover",
};
</script>

<template>
  <button
    type="button"
    :title="label"
    :aria-label="label"
    :disabled="disabled"
    class="inline-flex h-8 w-8 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40"
    :class="VARIANT_CLASS[variant]"
  >
    <component :is="icon" class="h-4 w-4" aria-hidden="true" />
  </button>
</template>
