<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useNetworkStatus } from "../composables/useNetworkStatus";
import { useOfflineQueue } from "../composables/useOfflineQueue";
import UnsyncedOrdersModal from "./UnsyncedOrdersModal.vue";

const { t } = useI18n({ useScope: "global" });
const network = useNetworkStatus();
const queue = useOfflineQueue();

const isReviewOpen = ref(false);
const failedCount = computed(() => queue.failedOrders.value.length);
// Online with only failed sales left: they won't sync on their own, so the
// bar says so instead of claiming it's syncing.
const isOnlyFailed = computed(() => network.isOnline.value && queue.pendingCount.value === 0 && failedCount.value > 0);
</script>

<template>
  <div
    v-if="!network.isOnline.value || queue.pendingCount.value > 0 || failedCount > 0"
    class="network-bar"
    :class="{ 'network-bar--offline': !network.isOnline.value || isOnlyFailed }"
  >
    <span class="network-bar__dot" />
    <span v-if="!network.isOnline.value">{{ t("network.offlineMessage") }}</span>
    <span v-else-if="isOnlyFailed">{{ t("network.failedMessage") }}</span>
    <span v-else>{{ t("network.backOnline") }}</span>
    <span v-if="queue.pendingCount.value > 0" class="network-bar__badge">
      {{ t("app.pendingBadge", { count: queue.pendingCount.value }) }}
    </span>
    <button v-if="failedCount > 0" type="button" class="network-bar__review" @click="isReviewOpen = true">
      {{ t("network.failedBadge", { count: failedCount }) }} &middot; {{ t("network.review") }}
    </button>
  </div>

  <UnsyncedOrdersModal v-if="isReviewOpen" @close="isReviewOpen = false" />
</template>

<style scoped>
.network-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.5rem 1rem;
  background: #2a6df4;
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 600;
  flex-shrink: 0;
}

.network-bar--offline {
  background: #c0392b;
}

.network-bar__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.network-bar__review {
  min-height: 32px;
  padding: 0.15rem 0.8rem;
  border: none;
  border-radius: 999px;
  background: #ffffff;
  color: #c0392b;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.network-bar__badge {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.25);
  font-weight: 700;
}
</style>
