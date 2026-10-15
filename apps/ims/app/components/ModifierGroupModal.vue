<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ModifierGroup, Product } from "~/types/catalog";

const props = defineProps<{
  group: ModifierGroup | null;
}>();

const open = defineModel<boolean>("open", { default: false });

interface OptionDraft {
  // Stable v-for key, so removing a row doesn't shift another row's inputs.
  key: number;
  id?: string;
  name: string;
  // Typed in the store's main currency; converted to USD (how it's stored) on save.
  // v-model.number leaves "" behind when the field is cleared.
  priceExtra: number | "";
  // For existing options: the stored USD price and the value first shown for it. An untouched
  // Riel price (rounded to 100៛ for display) then keeps its exact USD value on save.
  originalPriceUsd?: number;
  initialPriceInput?: number;
}

const { t } = useI18n();
const auth = useAuth();
const store = useCatalogStore();
const settings = useSettingsStore();
const { formatUsd, formatRiel, usdToRiel } = useCurrency();

const isRielInput = computed(() => settings.mainCurrency === "KHR");

const name = ref("");
const minSelection = ref<number | "">(0);
const maxSelection = ref<number | "">(1);
const options = ref<OptionDraft[]>([]);
const selectedProductIds = ref<Set<string>>(new Set());

const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

let nextKey = 0;

const isEditMode = computed(() => props.group !== null);

watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }
  errorMessage.value = null;
  name.value = props.group?.name ?? "";
  minSelection.value = props.group?.minSelection ?? 0;
  maxSelection.value = props.group?.maxSelection ?? 1;
  options.value = props.group
    ? props.group.options.map((option) => {
        const priceInput = isRielInput.value ? usdToRiel(option.priceExtra) : option.priceExtra;
        return {
          key: nextKey++,
          id: option.id,
          name: option.name,
          priceExtra: priceInput,
          originalPriceUsd: option.priceExtra,
          initialPriceInput: priceInput,
        };
      })
    : [{ key: nextKey++, name: "", priceExtra: 0 }];
  selectedProductIds.value = new Set(props.group?.productIds ?? []);
});

const productsByCategory = computed(() => {
  const grouped = new Map<string, Product[]>();
  for (const product of store.products) {
    const list = grouped.get(product.categoryId) ?? [];
    list.push(product);
    grouped.set(product.categoryId, list);
  }
  return store.categories
    .map((category) => ({ category, products: grouped.get(category.id) ?? [] }))
    .filter((entry) => entry.products.length > 0);
});

const nameError = computed(() => (name.value.trim().length === 0 ? t("common.nameRequired") : null));

const optionsError = computed(() => {
  if (options.value.length === 0) {
    return t("modifier.optionsRequired");
  }
  if (options.value.some((option) => option.name.trim().length === 0)) {
    return t("modifier.optionNameRequired");
  }
  if (options.value.some((option) => option.priceExtra === "" || option.priceExtra < 0)) {
    return t("modifier.optionPriceError");
  }
  return null;
});

const selectionError = computed(() => {
  const min = minSelection.value;
  const max = maxSelection.value;
  if (!Number.isInteger(min) || !Number.isInteger(max) || (min as number) < 0 || (max as number) < 1) {
    return t("modifier.selectionInvalid");
  }
  if ((min as number) > (max as number)) {
    return t("modifier.selectionMinAboveMax");
  }
  if ((min as number) > options.value.length) {
    return t("modifier.selectionMinAboveOptions");
  }
  return null;
});

const canSubmit = computed(() => !nameError.value && !optionsError.value && !selectionError.value && !isSubmitting.value);

function toPriceUsd(option: OptionDraft): number {
  const input = option.priceExtra as number;
  if (option.originalPriceUsd !== undefined && input === option.initialPriceInput) {
    return option.originalPriceUsd;
  }
  return isRielInput.value ? input / settings.exchangeRateRielPerUsd : input;
}

// Shows the price in the other currency under each row, so both values are visible.
function pricePreview(option: OptionDraft): string | null {
  if (option.priceExtra === "" || option.priceExtra < 0) {
    return null;
  }
  const usd = toPriceUsd(option);
  return isRielInput.value ? formatUsd(usd) : formatRiel(usdToRiel(usd));
}

function addOption() {
  options.value.push({ key: nextKey++, name: "", priceExtra: 0 });
}

function removeOption(key: number) {
  options.value = options.value.filter((option) => option.key !== key);
}

function toggleProduct(productId: string) {
  const next = new Set(selectedProductIds.value);
  if (next.has(productId)) {
    next.delete(productId);
  } else {
    next.add(productId);
  }
  selectedProductIds.value = next;
}

function close() {
  open.value = false;
}

async function submit() {
  if (!canSubmit.value) {
    return;
  }

  const token = auth.session.value?.token;
  if (!token) {
    errorMessage.value = t("common.sessionExpired");
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = null;

  const payload = {
    name: name.value.trim(),
    minSelection: minSelection.value as number,
    maxSelection: maxSelection.value as number,
    options: options.value.map((option) => ({
      id: option.id,
      name: option.name.trim(),
      priceExtra: toPriceUsd(option),
    })),
    productIds: [...selectedProductIds.value],
  };

  try {
    if (props.group) {
      await store.updateModifierGroup(props.group.id, payload, token);
    } else {
      await store.createModifierGroup(payload, token);
    }
    open.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("modifier.saveError");
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="flex max-h-full w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
      <h2 class="px-6 pt-6 text-lg font-bold text-slate-900">
        {{ isEditMode ? $t("modifier.editHeading") : $t("modifier.newHeading") }}
      </h2>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
        <div class="mt-4">
          <label class="block text-sm font-medium text-slate-700">{{ $t("common.name") }}</label>
          <input
            v-model="name"
            type="text"
            :placeholder="$t('modifier.namePlaceholder')"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-slate-700">{{ $t("modifier.minSelection") }}</label>
            <input
              v-model.number="minSelection"
              type="number"
              min="0"
              step="1"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700">{{ $t("modifier.maxSelection") }}</label>
            <input
              v-model.number="maxSelection"
              type="number"
              min="1"
              step="1"
              class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
        </div>
        <p class="mt-1 text-xs text-slate-500">{{ $t("modifier.selectionHint") }}</p>
        <p v-if="selectionError" class="mt-1 text-xs font-medium text-red-600">{{ selectionError }}</p>

        <div class="mt-5">
          <div class="flex items-center justify-between">
            <label class="block text-sm font-medium text-slate-700">{{ $t("modifier.options") }}</label>
            <button
              type="button"
              class="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              @click="addOption"
            >
              {{ $t("modifier.addOption") }}
            </button>
          </div>

          <div class="mt-2 space-y-2">
            <div v-for="option in options" :key="option.key">
              <div class="flex items-center gap-2">
                <input
                  v-model="option.name"
                  type="text"
                  :placeholder="$t('modifier.optionNamePlaceholder')"
                  class="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
                <input
                  v-model.number="option.priceExtra"
                  type="number"
                  :step="isRielInput ? 100 : 0.01"
                  min="0"
                  :aria-label="$t('modifier.optionPrice')"
                  :placeholder="isRielInput ? '0' : '0.00'"
                  class="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                />
                <button
                  type="button"
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  :aria-label="$t('modifier.removeOption')"
                  @click="removeOption(option.key)"
                >
                  &times;
                </button>
              </div>
              <p v-if="pricePreview(option)" class="mt-0.5 pr-11 text-right text-xs text-slate-400">
                ≈ {{ pricePreview(option) }}
              </p>
            </div>
          </div>
          <p class="mt-1 text-xs text-slate-500">{{
            $t("modifier.optionPriceHint", {
              currency: isRielInput ? $t("settings.currencyKhr") : $t("settings.currencyUsd"),
            })
          }}</p>
          <p v-if="optionsError" class="mt-1 text-xs font-medium text-red-600">{{ optionsError }}</p>
        </div>

        <div class="mt-5">
          <label class="block text-sm font-medium text-slate-700">{{ $t("modifier.appliesTo") }}</label>
          <p class="text-xs text-slate-500">{{ $t("modifier.appliesToHint") }}</p>
          <div class="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 p-3">
            <p v-if="productsByCategory.length === 0" class="text-sm text-slate-400">{{ $t("productTable.empty") }}</p>
            <div v-for="entry in productsByCategory" :key="entry.category.id" class="mb-3 last:mb-0">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ entry.category.name }}</p>
              <label
                v-for="product in entry.products"
                :key="product.id"
                class="mt-1 flex cursor-pointer items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  :checked="selectedProductIds.has(product.id)"
                  class="h-4 w-4 rounded border-slate-300"
                  @change="toggleProduct(product.id)"
                />
                {{ product.name }}
              </label>
            </div>
          </div>
        </div>

        <p v-if="errorMessage" class="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
          {{ errorMessage }}
        </p>
      </div>

      <div class="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          @click="close"
        >
          {{ $t("common.cancel") }}
        </button>
        <button
          type="button"
          :disabled="!canSubmit"
          class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          @click="submit"
        >
          {{ isSubmitting ? $t("common.saving") : isEditMode ? $t("common.saveChanges") : $t("modifier.createButton") }}
        </button>
      </div>
    </div>
  </div>
</template>
