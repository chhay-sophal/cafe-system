<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useNetworkStatus } from "../composables/useNetworkStatus";
import { useOfflineQueue } from "../composables/useOfflineQueue";

const { t } = useI18n({ useScope: "global" });
const network = useNetworkStatus();
const queue = useOfflineQueue();
</script>

<template>
  <div
    v-if="!network.isOnline.value || queue.pendingCount.value > 0"
    class="network-bar"
    :class="{ 'network-bar--offline': !network.isOnline.value }"
  >
    <span class="network-bar__dot" />
    <span v-if="!network.isOnline.value">{{ t("network.offlineMessage") }}</span>
    <span v-else>{{ t("network.backOnline") }}</span>
    <span v-if="queue.pendingCount.value > 0" class="network-bar__badge">
      {{ t("app.pendingBadge", { count: queue.pendingCount.value }) }}
    </span>
  </div>
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

.network-bar__badge {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.25);
  font-weight: 700;
}
</style>
