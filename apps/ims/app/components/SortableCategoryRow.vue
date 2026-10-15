<script setup lang="ts">
import { ref } from "vue";
import { GripVertical } from "@lucide/vue";
import { useSortable } from "@dnd-kit/vue/sortable";

// One row of the category list, made sortable with dnd-kit. useSortable must
// run once per item, which is why this is its own component and not inline
// in CategoryManagementModal's v-for.
const props = defineProps<{
  id: string;
  index: number;
  disabled: boolean;
}>();

const { t } = useI18n();

const element = ref<HTMLElement | null>(null);
const handle = ref<HTMLElement | null>(null);

const { isDragging } = useSortable({
  id: () => props.id,
  index: () => props.index,
  element,
  handle,
  disabled: () => props.disabled,
});
</script>

<template>
  <div
    ref="element"
    class="flex items-start gap-2 rounded-lg border p-3 transition-shadow"
    :class="isDragging ? 'border-primary bg-slate-50 shadow-md' : 'border-slate-200 bg-white'"
  >
    <button
      ref="handle"
      type="button"
      :title="t('categories.dragHandle')"
      :aria-label="t('categories.dragHandle')"
      :disabled="disabled"
      class="flex h-8 w-6 shrink-0 touch-none items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
      :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
    >
      <GripVertical class="h-4 w-4" />
    </button>
    <div class="min-w-0 flex-1">
      <slot />
    </div>
  </div>
</template>
