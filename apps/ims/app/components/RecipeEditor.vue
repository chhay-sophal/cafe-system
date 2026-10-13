<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Pencil, Plus, Trash2 } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/vue-table";
import type { InventoryItem } from "~/types/inventory";
import type { Product } from "~/types/catalog";
import type { RecipeIngredientDraft, RecipeTarget, RecipeTargetKind, RecipeUpdatePayload } from "~/types/recipe";

const { t } = useI18n();
const auth = useAuth();
const recipeStore = useRecipeStore();
const catalogStore = useCatalogStore();
const inventoryStore = useInventoryStore();

const targetKind = ref<RecipeTargetKind>("product");
const selectedProductId = ref("");
const selectedModifierId = ref("");

const rows = ref<RecipeIngredientDraft[]>([]);
const isLoadingRecipe = ref(false);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saveSuccess = ref(false);
const isSaving = ref(false);

const isDeleteOpen = ref(false);
const deletingProduct = ref<Product | null>(null);

const inventoryItems = computed<InventoryItem[]>(() => inventoryStore.items);

const { products } = storeToRefs(catalogStore);
const recipeTableFeatures = tableFeatures({ ...sortingFeatures });
const recipeColumnHelper = createColumnHelper<typeof recipeTableFeatures, Product>();

const recipeColumns = recipeColumnHelper.columns([
  recipeColumnHelper.accessor("name", { header: () => t("productTable.item") }),
  recipeColumnHelper.display({ id: "status", header: () => t("recipe.recipeStatus") }),
  recipeColumnHelper.display({ id: "actions", header: "" }),
]);

const recipeCellClass = {
  status: "px-4 py-3",
  actions: "px-4 py-3 text-right",
};

const recipeTable = useTable({ features: recipeTableFeatures, columns: recipeColumns, data: products });

const productsByCategory = computed(() => {
  const grouped = new Map<string, Product[]>();
  for (const product of catalogStore.products) {
    const list = grouped.get(product.categoryId) ?? [];
    list.push(product);
    grouped.set(product.categoryId, list);
  }
  return catalogStore.categories
    .map((category) => ({ category, products: grouped.get(category.id) ?? [] }))
    .filter((group) => group.products.length > 0);
});

const modifierOptionChoices = computed(() =>
  catalogStore.modifierGroups.flatMap((group) =>
    group.options.map((option) => ({ id: option.id, label: `${group.name}: ${option.name}` })),
  ),
);

const catalogErrorMessage = computed(() => catalogStore.error ?? recipeStore.catalogError);
const isCatalogLoading = computed(() => catalogStore.isLoading || recipeStore.isLoadingCatalog);

const currentTarget = computed<RecipeTarget | null>(() => {
  if (targetKind.value === "product" && selectedProductId.value) {
    return { kind: "product", id: selectedProductId.value };
  }
  if (targetKind.value === "modifier" && selectedModifierId.value) {
    return { kind: "modifier", id: selectedModifierId.value };
  }
  return null;
});

const currentTargetLabel = computed(() => {
  if (currentTarget.value?.kind === "product") {
    return catalogStore.products.find((p) => p.id === currentTarget.value?.id)?.name ?? "";
  }
  if (currentTarget.value?.kind === "modifier") {
    return modifierOptionChoices.value.find((o) => o.id === currentTarget.value?.id)?.label ?? "";
  }
  return "";
});

function unitForRow(row: RecipeIngredientDraft): string {
  return inventoryItems.value.find((item) => item.id === row.inventoryItemId)?.unit ?? "-";
}

// Retired ingredients shouldn't be offered for new recipe rows, but an
// existing row already pointing at one (from before it was deactivated)
// must keep showing it - otherwise editing that recipe silently blanks
// out a valid, saved ingredient link.
function pickerOptionsForRow(row: RecipeIngredientDraft): InventoryItem[] {
  const active = inventoryItems.value.filter((item) => item.isActive);
  if (row.inventoryItemId && !active.some((item) => item.id === row.inventoryItemId)) {
    const selected = inventoryItems.value.find((item) => item.id === row.inventoryItemId);
    if (selected) {
      return [...active, selected];
    }
  }
  return active;
}

function rowError(row: RecipeIngredientDraft): string | null {
  if (!row.inventoryItemId) {
    return t("recipe.selectIngredientRequired");
  }
  if (row.quantityRequired === null || Number.isNaN(row.quantityRequired) || row.quantityRequired <= 0) {
    return t("recipe.quantityError");
  }
  return null;
}

const hasRowErrors = computed(() => rows.value.some((row) => rowError(row) !== null));
const canSave = computed(() => currentTarget.value !== null && !hasRowErrors.value && !isSaving.value);

function addRow() {
  rows.value.push({ rowKey: crypto.randomUUID(), inventoryItemId: "", quantityRequired: null });
}

function removeRow(rowKey: string) {
  rows.value = rows.value.filter((row) => row.rowKey !== rowKey);
}

async function loadRecipeForTarget() {
  const target = currentTarget.value;
  if (!target) {
    rows.value = [];
    return;
  }

  isLoadingRecipe.value = true;
  loadError.value = null;

  try {
    const records = await recipeStore.fetchRecipe(target);
    rows.value = records.map((record) => ({
      rowKey: record.id,
      inventoryItemId: record.inventoryItemId,
      quantityRequired: record.quantityRequired,
    }));
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : t("recipe.loadError");
    rows.value = [];
  } finally {
    isLoadingRecipe.value = false;
  }
}

function switchTargetKind(kind: RecipeTargetKind) {
  targetKind.value = kind;
  selectedProductId.value = "";
  selectedModifierId.value = "";
  rows.value = [];
  saveSuccess.value = false;
  saveError.value = null;
}

function selectTarget() {
  saveSuccess.value = false;
  saveError.value = null;
  loadRecipeForTarget();
}

function startEditingProduct(productId: string) {
  targetKind.value = "product";
  selectedProductId.value = productId;
  selectTarget();
}

function openDeleteModal(product: Product) {
  deletingProduct.value = product;
  isDeleteOpen.value = true;
}

function handleRecipeDeleted(productId: string) {
  if (currentTarget.value?.kind === "product" && currentTarget.value.id === productId) {
    rows.value = [];
  }
}

async function handleSave() {
  if (!canSave.value || !currentTarget.value) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    saveError.value = t("common.sessionExpired");
    return;
  }

  isSaving.value = true;
  saveError.value = null;
  saveSuccess.value = false;

  const payload: RecipeUpdatePayload = {
    ingredients: rows.value.map((row) => ({
      inventoryItemId: row.inventoryItemId,
      quantityRequired: row.quantityRequired as number,
    })),
  };

  if (currentTarget.value.kind === "product") {
    payload.productId = currentTarget.value.id;
  } else {
    payload.modifierId = currentTarget.value.id;
  }

  try {
    await recipeStore.saveRecipe(payload, token);
    await loadRecipeForTarget();
    saveSuccess.value = true;
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : t("recipe.saveError");
  } finally {
    isSaving.value = false;
  }
}

onMounted(async () => {
  if (!catalogStore.hasLoadedOnce) {
    await catalogStore.fetchCatalog();
  }

  if (!recipeStore.hasLoadedCatalog) {
    await recipeStore.fetchCatalog();
  }

  if (inventoryItems.value.length === 0) {
    await inventoryStore.fetchInventory();
  }
});
</script>

<template>
  <div>
    <section class="mb-8">
      <h2 class="mb-3 text-sm font-semibold text-slate-700">{{ $t("recipe.menuItemsHeading") }}</h2>

      <p v-if="catalogErrorMessage" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">
        {{ catalogErrorMessage }}
      </p>

      <p v-else-if="isCatalogLoading" class="p-6 text-center text-sm text-slate-500">
        {{ $t("recipe.loadingMenuItems") }}
      </p>

      <div v-else class="max-h-[45vh] overflow-auto rounded-lg border border-slate-200">
        <DataTable :table="recipeTable" :empty-text="$t('productTable.empty')" :cell-class="recipeCellClass">
          <template #cell-status="{ item }">
            <span
              v-if="recipeStore.hasProductRecipe(item.id)"
              class="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"
            >
              {{ $t("recipe.ingredientCount", { count: recipeStore.productRecipeCounts[item.id] }) }}
            </span>
            <span
              v-else
              class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700"
            >
              {{ $t("recipe.notConfigured") }}
            </span>
          </template>

          <template #cell-actions="{ item }">
            <div class="flex justify-end gap-2">
              <IconButton v-if="!recipeStore.hasProductRecipe(item.id)" :icon="Plus" :label="$t('recipe.createRecipe')" variant="primary" @click="startEditingProduct(item.id)" />
              <template v-else>
                <IconButton :icon="Pencil" :label="$t('common.edit')" @click="startEditingProduct(item.id)" />
                <IconButton :icon="Trash2" :label="$t('common.delete')" variant="danger" @click="openDeleteModal(item)" />
              </template>
            </div>
          </template>
        </DataTable>
      </div>
    </section>

    <div class="mb-4 flex gap-2">
      <button
        type="button"
        class="rounded-lg px-4 py-2 text-sm font-semibold"
        :class="targetKind === 'product' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'"
        @click="switchTargetKind('product')"
      >
        {{ $t("recipe.menuItemTab") }}
      </button>
      <button
        type="button"
        class="rounded-lg px-4 py-2 text-sm font-semibold"
        :class="targetKind === 'modifier' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'"
        @click="switchTargetKind('modifier')"
      >
        {{ $t("recipe.modifierChoiceTab") }}
      </button>
    </div>

    <template v-if="!catalogErrorMessage && !isCatalogLoading">
      <div class="mb-6 max-w-md">
        <label class="block text-sm font-medium text-slate-700">
          {{ targetKind === "product" ? $t("recipe.menuItemTab") : $t("recipe.modifierChoiceTab") }}
        </label>

        <select
          v-if="targetKind === 'product'"
          v-model="selectedProductId"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          @change="selectTarget"
        >
          <option value="">{{ $t("recipe.selectMenuItem") }}</option>
          <optgroup v-for="group in productsByCategory" :key="group.category.id" :label="group.category.name">
            <option v-for="product in group.products" :key="product.id" :value="product.id">
              {{ product.name }}
            </option>
          </optgroup>
        </select>

        <select
          v-else
          v-model="selectedModifierId"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          @change="selectTarget"
        >
          <option value="">{{ $t("recipe.selectModifierChoice") }}</option>
          <option v-for="choice in modifierOptionChoices" :key="choice.id" :value="choice.id">
            {{ choice.label }}
          </option>
        </select>
      </div>

      <p v-if="!currentTarget" class="text-sm text-slate-500">
        {{ $t("recipe.selectPrompt", { target: targetKind === "product" ? $t("recipe.targetNoun.product") : $t("recipe.targetNoun.modifier") }) }}
      </p>

      <template v-else>
        <p v-if="loadError" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ loadError }}</p>

        <template v-else-if="isLoadingRecipe">
          <p class="p-6 text-center text-sm text-slate-500">{{ $t("recipe.loadingRecipe") }}</p>
        </template>

        <template v-else>
          <h2 class="mb-3 text-sm font-semibold text-slate-700">{{ $t("recipe.ingredientsFor", { label: currentTargetLabel }) }}</h2>

          <div class="space-y-3">
            <p v-if="rows.length === 0" class="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              {{ $t("recipe.noIngredients") }}
            </p>

            <div
              v-for="row in rows"
              :key="row.rowKey"
              class="flex flex-wrap items-start gap-3 rounded-lg border border-slate-200 p-3"
            >
              <div class="min-w-[220px] flex-1">
                <select
                  v-model="row.inventoryItemId"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  <option value="">{{ $t("recipe.selectIngredientOption") }}</option>
                  <option v-for="item in pickerOptionsForRow(row)" :key="item.id" :value="item.id">{{ item.name }}</option>
                </select>
              </div>

              <div class="w-32">
                <input
                  v-model.number="row.quantityRequired"
                  type="number"
                  step="any"
                  :placeholder="$t('recipe.quantityPlaceholder')"
                  class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
              </div>

              <div class="w-24">
                <select disabled class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  <option>{{ unitForRow(row) }}</option>
                </select>
              </div>

              <button
                type="button"
                class="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                @click="removeRow(row.rowKey)"
              >
                {{ $t("recipe.remove") }}
              </button>

              <p v-if="rowError(row)" class="w-full text-xs font-medium text-red-600">{{ rowError(row) }}</p>
            </div>
          </div>

          <button
            type="button"
            class="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            @click="addRow"
          >
            {{ $t("recipe.addIngredient") }}
          </button>

          <div class="mt-6 flex items-center gap-4">
            <button
              type="button"
              :disabled="!canSave"
              class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              @click="handleSave"
            >
              {{ isSaving ? $t("common.saving") : $t("recipe.saveRecipe") }}
            </button>

            <p v-if="saveError" class="text-sm font-medium text-red-600">{{ saveError }}</p>
            <p v-else-if="saveSuccess" class="text-sm font-medium text-emerald-600">{{ $t("recipe.saveSuccess") }}</p>
          </div>
        </template>
      </template>
    </template>

    <RecipeDeleteModal v-model:open="isDeleteOpen" :product="deletingProduct" @deleted="handleRecipeDeleted" />
  </div>
</template>
