<script setup lang="ts">
const open = defineModel<boolean>("open", { default: false });

const emit = defineEmits<{
  leave: [];
}>();

function stay() {
  open.value = false;
}

function leave() {
  open.value = false;
  emit("leave");
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
      <h2 class="text-lg font-bold text-slate-900">{{ $t("settings.leaveHeading") }}</h2>
      <p class="mt-2 text-sm text-slate-600">{{ $t("settings.leaveMessage") }}</p>

      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          @click="stay"
        >
          {{ $t("settings.stay") }}
        </button>
        <button
          type="button"
          class="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          @click="leave"
        >
          {{ $t("settings.leaveConfirm") }}
        </button>
      </div>
    </div>
  </div>
</template>
