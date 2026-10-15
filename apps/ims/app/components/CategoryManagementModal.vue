<script setup lang="ts">
import { ref, watch } from "vue";
import { Pencil, Trash2 } from "@lucide/vue";
import { DragDropProvider, type DragEndEvent } from "@dnd-kit/vue";
import { move } from "@dnd-kit/helpers";
import type { Category } from "~/types/catalog";

const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const auth = useAuth();
const store = useCatalogStore();

const deletingCategory = ref<Category | null>(null);
const isDeleteConfirmOpen = ref(false);

const newName = ref("");
const isCreating = ref(false);
const createError = ref<string | null>(null);

const editingId = ref<string | null>(null);
const editName = ref("");
// Not editable here (order is set by dragging), but PUT /api/categories/:id
// defaults a missing sortOrder to 0, so the existing value is sent back as-is.
const editSortOrder = ref<number | null>(null);
const isSavingEdit = ref(false);
const editError = ref<string | null>(null);

watch(open, (isOpen) => {
  if (isOpen) {
    newName.value = "";
    createError.value = null;
    editingId.value = null;
    editError.value = null;
    reorderError.value = null;
  }
});

// Drag-and-drop ordering with dnd-kit (pointer, touch, and keyboard: focus a
// handle, Space to pick up, arrow keys to move, Space to drop). dnd-kit moves
// the rows on screen while dragging; the array is updated and saved on drop.
const orderedCategories = ref<Category[]>([...store.categories]);
const isDragging = ref(false);
const isSavingOrder = ref(false);
const reorderError = ref<string | null>(null);

watch(
  () => store.categories,
  (categories) => {
    if (!isDragging.value) {
      orderedCategories.value = [...categories];
    }
  },
);

const isReorderDisabled = () => editingId.value !== null || isSavingOrder.value || orderedCategories.value.length < 2;

function onDragStart() {
  isDragging.value = true;
  reorderError.value = null;
}

function onDragEnd(event: DragEndEvent) {
  isDragging.value = false;
  if (event.canceled) {
    return;
  }
  const previousIds = orderedCategories.value.map((category) => category.id);
  orderedCategories.value = move(orderedCategories.value, event);
  saveOrder(previousIds);
}

async function saveOrder(previousIds: string[]) {
  const ids = orderedCategories.value.map((category) => category.id);
  if (ids.join() === previousIds.join()) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    reorderError.value = t("common.sessionExpired");
    orderedCategories.value = [...store.categories];
    return;
  }

  isSavingOrder.value = true;
  reorderError.value = null;

  try {
    await store.reorderCategories(ids, token);
  } catch (error) {
    reorderError.value = error instanceof Error ? error.message : t("categories.reorderError");
    orderedCategories.value = [...store.categories];
  } finally {
    isSavingOrder.value = false;
  }
}

function close() {
  open.value = false;
}

async function createCategory() {
  if (newName.value.trim().length === 0 || isCreating.value) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    createError.value = t("common.sessionExpired");
    return;
  }

  isCreating.value = true;
  createError.value = null;

  try {
    // New categories go to the end of the list; drag them into place afterwards.
    const lastSortOrder = Math.max(-1, ...store.categories.map((category) => category.sortOrder ?? 0));
    await store.createCategory({ name: newName.value.trim(), sortOrder: lastSortOrder + 1 }, token);
    newName.value = "";
  } catch (error) {
    createError.value = error instanceof Error ? error.message : t("categories.createError");
  } finally {
    isCreating.value = false;
  }
}

function startEdit(category: { id: string; name: string; sortOrder: number | null }) {
  editingId.value = category.id;
  editName.value = category.name;
  editSortOrder.value = category.sortOrder;
  editError.value = null;
}

function startDelete(category: Category) {
  deletingCategory.value = category;
  isDeleteConfirmOpen.value = true;
}

function cancelEdit() {
  editingId.value = null;
  editError.value = null;
}

async function saveEdit() {
  if (!editingId.value || editName.value.trim().length === 0 || isSavingEdit.value) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    editError.value = t("common.sessionExpired");
    return;
  }

  isSavingEdit.value = true;
  editError.value = null;

  try {
    await store.updateCategory(editingId.value, { name: editName.value.trim(), sortOrder: editSortOrder.value ?? 0 }, token);
    editingId.value = null;
  } catch (error) {
    editError.value = error instanceof Error ? error.message : t("categories.updateError");
  } finally {
    isSavingEdit.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
      <div class="flex items-start justify-between">
        <h2 class="text-lg font-bold text-slate-900">{{ $t("categories.manage") }}</h2>
        <button type="button" class="text-2xl leading-none text-slate-400 hover:text-slate-600" @click="close">
          &times;
        </button>
      </div>

      <p v-if="orderedCategories.length > 1" class="mt-1 text-xs text-slate-500">{{ $t("categories.dragHint") }}</p>
      <p v-if="reorderError" class="mt-2 text-xs font-medium text-red-600">{{ reorderError }}</p>

      <DragDropProvider @drag-start="onDragStart" @drag-end="onDragEnd">
        <div class="mt-4 max-h-64 space-y-2 overflow-y-auto">
          <div v-if="orderedCategories.length === 0" class="text-sm text-slate-400">{{ $t("categories.none") }}</div>

          <SortableCategoryRow
            v-for="(category, index) in orderedCategories"
            :id="category.id"
            :key="category.id"
            :index="index"
            :disabled="isReorderDisabled()"
          >
            <template v-if="editingId === category.id">
              <input
                v-model="editName"
                type="text"
                class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
              <p v-if="editError" class="mt-2 text-xs font-medium text-red-600">{{ editError }}</p>
              <div class="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  class="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  @click="cancelEdit"
                >
                  {{ $t("common.cancel") }}
                </button>
                <button
                  type="button"
                  :disabled="isSavingEdit || editName.trim().length === 0"
                  class="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                  @click="saveEdit"
                >
                  {{ isSavingEdit ? $t("common.saving") : $t("common.save") }}
                </button>
              </div>
            </template>

            <div v-else class="flex min-h-8 items-center justify-between gap-2">
              <span class="truncate text-sm text-slate-700">{{ category.name }}</span>
              <div class="flex gap-2">
                <IconButton :icon="Pencil" :label="$t('common.edit')" @click="startEdit(category)" />
                <IconButton :icon="Trash2" :label="$t('common.delete')" variant="danger" @click="startDelete(category)" />
              </div>
            </div>
          </SortableCategoryRow>
        </div>
      </DragDropProvider>

      <div class="mt-4 border-t border-slate-200 pt-4">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{{ $t("categories.addHeading") }}</p>
        <input
          v-model="newName"
          type="text"
          :placeholder="$t('categories.namePlaceholder')"
          class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        <p v-if="createError" class="mt-2 text-xs font-medium text-red-600">{{ createError }}</p>
        <button
          type="button"
          :disabled="isCreating || newName.trim().length === 0"
          class="mt-3 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          @click="createCategory"
        >
          {{ isCreating ? $t("categories.adding") : $t("categories.add") }}
        </button>
      </div>
    </div>

    <CategoryDeleteConfirmModal v-model:open="isDeleteConfirmOpen" :category="deletingCategory" />
  </div>
</template>
