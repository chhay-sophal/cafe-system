<script setup lang="ts">
import { ref, watch } from "vue";
import type { Category } from "~/types/catalog";

const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const auth = useAuth();
const store = useCatalogStore();

const deletingCategory = ref<Category | null>(null);
const isDeleteConfirmOpen = ref(false);

const newName = ref("");
const newSortOrder = ref<number | null>(null);
const isCreating = ref(false);
const createError = ref<string | null>(null);

const editingId = ref<string | null>(null);
const editName = ref("");
const editSortOrder = ref<number | null>(null);
const isSavingEdit = ref(false);
const editError = ref<string | null>(null);

watch(open, (isOpen) => {
  if (isOpen) {
    newName.value = "";
    newSortOrder.value = null;
    createError.value = null;
    editingId.value = null;
    editError.value = null;
  }
});

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
    await store.createCategory({ name: newName.value.trim(), sortOrder: newSortOrder.value ?? 0 }, token);
    newName.value = "";
    newSortOrder.value = null;
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

      <div class="mt-4 max-h-64 space-y-2 overflow-y-auto">
        <div v-if="store.categories.length === 0" class="text-sm text-slate-400">{{ $t("categories.none") }}</div>

        <div
          v-for="category in store.categories"
          :key="category.id"
          class="rounded-lg border border-slate-200 p-3"
        >
          <template v-if="editingId === category.id">
            <div class="flex gap-2">
              <input
                v-model="editName"
                type="text"
                class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
              <input
                v-model.number="editSortOrder"
                type="number"
                :placeholder="$t('categories.orderPlaceholder')"
                class="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>
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
                class="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                @click="saveEdit"
              >
                {{ isSavingEdit ? $t("common.saving") : $t("common.save") }}
              </button>
            </div>
          </template>

          <div v-else class="flex items-center justify-between">
            <span class="text-sm text-slate-700">{{ category.name }}</span>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                @click="startEdit(category)"
              >
                {{ $t("common.edit") }}
              </button>
              <button
                type="button"
                class="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                @click="startDelete(category)"
              >
                {{ $t("common.delete") }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-4 border-t border-slate-200 pt-4">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{{ $t("categories.addHeading") }}</p>
        <div class="flex gap-2">
          <input
            v-model="newName"
            type="text"
            :placeholder="$t('categories.namePlaceholder')"
            class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <input
            v-model.number="newSortOrder"
            type="number"
            :placeholder="$t('categories.orderPlaceholder')"
            class="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <p v-if="createError" class="mt-2 text-xs font-medium text-red-600">{{ createError }}</p>
        <button
          type="button"
          :disabled="isCreating || newName.trim().length === 0"
          class="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          @click="createCategory"
        >
          {{ isCreating ? $t("categories.adding") : $t("categories.add") }}
        </button>
      </div>
    </div>

    <CategoryDeleteConfirmModal v-model:open="isDeleteConfirmOpen" :category="deletingCategory" />
  </div>
</template>
