import { getCurrentWindow } from "@tauri-apps/api/window";
import { createApp } from "vue";
import App from "./App.vue";
import CustomerDisplay from "./components/CustomerDisplay.vue";
import { i18n } from "./i18n";

// One frontend bundle, two windows: the cashier ("main") mounts the full
// register UI, the customer-facing screen ("customer-display", created at
// startup in src-tauri/src/lib.rs when a second monitor is detected) mounts
// a read-only view synced over Tauri's event bus (see
// composables/useCustomerDisplayChannel.ts).
function resolveWindowLabel(): string {
  try {
    // Reads window.__TAURI_INTERNALS__ directly and throws outside a real
    // Tauri webview (e.g. plain `vite dev` in a browser tab) - fall back to
    // the normal cashier view rather than crashing before anything mounts.
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

const root = resolveWindowLabel() === "customer-display" ? CustomerDisplay : App;

createApp(root).use(i18n).mount("#app");
