<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Product } from "~/types/catalog";

const props = defineProps<{
  product: Product | null;
}>();

const open = defineModel<boolean>("open", { default: false });

const { t } = useI18n();
const auth = useAuth();
const store = useCatalogStore();
const { uploadProductImage } = useApi();

const name = ref("");
const categoryId = ref("");
const basePrice = ref<number | null>(null);
const isAvailable = ref(true);
const existingImageUrl = ref<string | null>(null);
const selectedFile = ref<File | null>(null);
const previewObjectUrl = ref<string | null>(null);

const isSubmitting = ref(false);
const isUploadingImage = ref(false);
const errorMessage = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const isEditMode = computed(() => props.product !== null);

const nameError = computed(() => (name.value.trim().length === 0 ? t("common.nameRequired") : null));
const categoryError = computed(() => (categoryId.value.length === 0 ? t("product.categoryRequired") : null));
const priceError = computed(() =>
  basePrice.value === null || Number.isNaN(basePrice.value) || basePrice.value < 0
    ? t("product.priceError")
    : null,
);

const canSubmit = computed(
  () => !nameError.value && !categoryError.value && !priceError.value && !isSubmitting.value && !isUploadingImage.value,
);

const thumbnailUrl = computed(() => previewObjectUrl.value ?? resolveImageUrl(existingImageUrl.value));
const imageLoadFailed = ref(false);

function revokePreview() {
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = null;
  }
}

function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  selectedFile.value = file;
  revokePreview();
  imageLoadFailed.value = false;
  if (file) {
    previewObjectUrl.value = URL.createObjectURL(file);
  }
}

watch(open, (isOpen) => {
  if (!isOpen) {
    revokePreview();
    return;
  }

  imageLoadFailed.value = false;

  errorMessage.value = null;
  selectedFile.value = null;
  revokePreview();
  if (fileInput.value) {
    fileInput.value.value = "";
  }

  if (props.product) {
    name.value = props.product.name;
    categoryId.value = props.product.categoryId;
    basePrice.value = props.product.basePrice;
    isAvailable.value = props.product.isAvailable;
    existingImageUrl.value = props.product.imageUrl;
  } else {
    name.value = "";
    categoryId.value = store.categories[0]?.id ?? "";
    basePrice.value = null;
    isAvailable.value = true;
    existingImageUrl.value = null;
  }
});

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

  let imageUrl = existingImageUrl.value ?? undefined;

  if (selectedFile.value) {
    isUploadingImage.value = true;
    try {
      const result = await uploadProductImage(selectedFile.value, token);
      imageUrl = result.url;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : t("product.uploadError");
      isUploadingImage.value = false;
      isSubmitting.value = false;
      return;
    }
    isUploadingImage.value = false;
  }

  const payload = {
    categoryId: categoryId.value,
    name: name.value.trim(),
    basePrice: basePrice.value as number,
    isAvailable: isAvailable.value,
    imageUrl,
  };

  try {
    if (props.product) {
      await store.updateProduct(props.product.id, payload, token);
    } else {
      await store.createProduct(payload, token);
    }
    open.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("product.saveError");
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
      <h2 class="text-lg font-bold text-slate-900">{{ isEditMode ? $t("product.editHeading") : $t("product.newHeading") }}</h2>

      <div class="mt-4 flex items-center gap-4">
        <img
          v-if="thumbnailUrl && !imageLoadFailed"
          :src="thumbnailUrl"
          :alt="$t('product.previewAlt')"
          class="h-16 w-16 rounded-lg object-cover"
          @error="imageLoadFailed = true"
        />
        <div v-else class="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-2xl font-semibold text-slate-400">
          {{ name.slice(0, 1) || "?" }}
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700">{{ $t("product.imageLabel") }}</label>
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="mt-1 text-sm text-slate-600"
            @change="handleFileChange"
          />
        </div>
      </div>

      <div class="mt-4">
        <label class="block text-sm font-medium text-slate-700">{{ $t("common.name") }}</label>
        <input
          v-model="name"
          type="text"
          :placeholder="$t('product.namePlaceholder')"
          class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-slate-700">{{ $t("product.category") }}</label>
          <select
            v-model="categoryId"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="">{{ $t("common.selectEllipsis") }}</option>
            <option v-for="category in store.categories" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700">{{ $t("product.basePrice") }}</label>
          <input
            v-model.number="basePrice"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
        <span class="text-sm font-medium text-slate-700">{{ $t("product.availableOnMenu") }}</span>
        <button
          type="button"
          role="switch"
          :aria-checked="isAvailable"
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
          :class="isAvailable ? 'bg-emerald-500' : 'bg-slate-300'"
          @click="isAvailable = !isAvailable"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
            :class="isAvailable ? 'translate-x-6' : 'translate-x-1'"
          />
        </button>
      </div>

      <p v-if="errorMessage" class="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
        {{ errorMessage }}
      </p>

      <div class="mt-6 flex justify-end gap-3">
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
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          @click="submit"
        >
          {{ isUploadingImage ? $t("product.uploadingImage") : isSubmitting ? $t("common.saving") : isEditMode ? $t("common.saveChanges") : $t("product.createButton") }}
        </button>
      </div>
    </div>
  </div>
</template>
