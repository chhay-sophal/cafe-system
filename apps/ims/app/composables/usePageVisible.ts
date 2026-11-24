import { onActivated, onDeactivated, ref } from "vue";

// Pages stay alive while another one is open (<KeepAlive> in app.vue), so
// their search, filters, sorting and pagination are kept. A page's own
// mounted hook only runs on its first visit - `onShow` runs on every visit,
// for loading what may have gone stale meanwhile (sales the POS added, a
// period changed on another page), and `isVisible` lets watchers skip work
// while the page is hidden.
export function usePageVisible(onShow?: () => void) {
  const isVisible = ref(false);
  onActivated(() => {
    isVisible.value = true;
    onShow?.();
  });
  onDeactivated(() => {
    isVisible.value = false;
  });
  return { isVisible };
}
