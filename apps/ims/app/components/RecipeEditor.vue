<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { Category, ModifierGroup, Product } from "~/types/catalog";
import type { InventoryItem } from "~/types/inventory";
import type { RecipeIngredientDraft, RecipeTarget, RecipeTargetKind, RecipeUpdatePayload } from "~/types/recipe";

const auth = useAuth();
const { fetchCategories, fetchProducts, fetchModifiers, fetchRecipe, saveRecipe } = useApi();
const inventoryStore = useInventoryStore();

const categories = ref<Category[]>([]);
const products = ref<Product[]>([]);
const modifierGroups = ref<ModifierGroup[]>([]);
const isLoadingCatalog = ref(true);
const catalogError = ref<string | null>(null);

const targetKind = ref<RecipeTargetKind>("product");
const selectedProductId = ref("");
const selectedModifierId = ref("");

const rows = ref<RecipeIngredientDraft[]>([]);
const isLoadingRecipe = ref(false);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saveSuccess = ref(false);
const isSaving = ref(false);

const inventoryItems = computed<InventoryItem[]>(() => inventoryStore.items);

const productsByCategory = computed(() => {
  const grouped = new Map<string, Product[]>();
  for (const product of products.value) {
    const list = grouped.get(product.categoryId) ?? [];
    list.push(product);
    grouped.set(product.categoryId, list);
  }
  return categories.value
    .map((category) => ({ category, products: grouped.get(category.id) ?? [] }))
    .filter((group) => group.products.length > 0);
});

const modifierOptionChoices = computed(() =>
  modifierGroups.value.flatMap((group) =>
    group.options.map((option) => ({ id: option.id, label: `${group.name}: ${option.name}` })),
  ),
);

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
    return products.value.find((p) => p.id === currentTarget.value?.id)?.name ?? "";
  }
  if (currentTarget.value?.kind === "modifier") {
    return modifierOptionChoices.value.find((o) => o.id === currentTarget.value?.id)?.label ?? "";
  }
  return "";
});

function unitForRow(row: RecipeIngredientDraft): string {
  return inventoryItems.value.find((item) => item.id === row.inventoryItemId)?.unit ?? "-";
}

function rowError(row: RecipeIngredientDraft): string | null {
  if (!row.inventoryItemId) {
    return "Select an ingredient";
  }
  if (row.quantityRequired === null || Number.isNaN(row.quantityRequired) || row.quantityRequired <= 0) {
    return "Enter a quantity greater than zero";
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
    const records = await fetchRecipe(target);
    rows.value = records.map((record) => ({
      rowKey: record.id,
      inventoryItemId: record.inventoryItemId,
      quantityRequired: record.quantityRequired,
    }));
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "Failed to load recipe.";
    rows.value = [];
  } finally {
    isLoadingRecipe.value = false;
  }
}

async function handleSave() {
  if (!canSave.value || !currentTarget.value) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    saveError.value = "Your session has expired. Please sign in again.";
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
    await saveRecipe(payload, token);
    await loadRecipeForTarget();
    saveSuccess.value = true;
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "Failed to save recipe.";
  } finally {
    isSaving.value = false;
  }
}

watch(targetKind, () => {
  selectedProductId.value = "";
  selectedModifierId.value = "";
  rows.value = [];
});

watch(currentTarget, () => {
  saveSuccess.value = false;
  saveError.value = null;
  loadRecipeForTarget();
});

onMounted(async () => {
  isLoadingCatalog.value = true;
  catalogError.value = null;

  try {
    const [categoryList, productList, modifierList] = await Promise.all([
      fetchCategories(),
      fetchProducts(),
      fetchModifiers(),
    ]);
    categories.value = categoryList;
    products.value = productList;
    modifierGroups.value = modifierList;

    if (inventoryItems.value.length === 0) {
      await inventoryStore.fetchInventory();
    }
  } catch (error) {
    catalogError.value = error instanceof Error ? error.message : "Failed to load catalog.";
  } finally {
    isLoadingCatalog.value = false;
  }
});
</script>

<template>
  <div>
    <div class="mb-4 flex gap-2">
      <button
        type="button"
        class="rounded-lg px-4 py-2 text-sm font-semibold"
        :class="targetKind === 'product' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'"
        @click="targetKind = 'product'"
      >
        Menu Item
      </button>
      <button
        type="button"
        class="rounded-lg px-4 py-2 text-sm font-semibold"
        :class="targetKind === 'modifier' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'"
        @click="targetKind = 'modifier'"
      >
        Modifier Choice
      </button>
    </div>

    <p v-if="catalogError" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ catalogError }}</p>

    <template v-else-if="isLoadingCatalog">
      <p class="p-6 text-center text-sm text-slate-500">Loading catalog...</p>
    </template>

    <template v-else>
      <div class="mb-6 max-w-md">
        <label class="block text-sm font-medium text-slate-700">
          {{ targetKind === "product" ? "Menu Item" : "Modifier Choice" }}
        </label>

        <select
          v-if="targetKind === 'product'"
          v-model="selectedProductId"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value="">Select a menu item...</option>
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
        >
          <option value="">Select a modifier choice...</option>
          <option v-for="choice in modifierOptionChoices" :key="choice.id" :value="choice.id">
            {{ choice.label }}
          </option>
        </select>
      </div>

      <p v-if="!currentTarget" class="text-sm text-slate-500">
        Select a {{ targetKind === "product" ? "menu item" : "modifier choice" }} above to edit its ingredient
        recipe.
      </p>

      <template v-else>
        <p v-if="loadError" class="rounded-lg bg-red-50 p-4 text-sm font-medium text-red-700">{{ loadError }}</p>

        <template v-else-if="isLoadingRecipe">
          <p class="p-6 text-center text-sm text-slate-500">Loading recipe...</p>
        </template>

        <template v-else>
          <h2 class="mb-3 text-sm font-semibold text-slate-700">Ingredients for "{{ currentTargetLabel }}"</h2>

          <div class="space-y-3">
            <p v-if="rows.length === 0" class="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No ingredients mapped yet. Add one below.
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
                  <option value="">Select an ingredient...</option>
                  <option v-for="item in inventoryItems" :key="item.id" :value="item.id">{{ item.name }}</option>
                </select>
              </div>

              <div class="w-32">
                <input
                  v-model.number="row.quantityRequired"
                  type="number"
                  step="any"
                  placeholder="Quantity"
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
                Remove
              </button>

              <p v-if="rowError(row)" class="w-full text-xs font-medium text-red-600">{{ rowError(row) }}</p>
            </div>
          </div>

          <button
            type="button"
            class="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            @click="addRow"
          >
            + Add Ingredient
          </button>

          <div class="mt-6 flex items-center gap-4">
            <button
              type="button"
              :disabled="!canSave"
              class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              @click="handleSave"
            >
              {{ isSaving ? "Saving..." : "Save Recipe" }}
            </button>

            <p v-if="saveError" class="text-sm font-medium text-red-600">{{ saveError }}</p>
            <p v-else-if="saveSuccess" class="text-sm font-medium text-emerald-600">Recipe saved.</p>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
