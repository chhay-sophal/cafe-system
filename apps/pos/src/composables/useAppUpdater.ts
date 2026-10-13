import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

// A failed or offline check must never block the register from opening -
// this is a best-effort background action, called once at cold start.
export async function checkForUpdateAndInstall() {
  // Dev builds carry the placeholder version from tauri.conf.json, so any
  // published release looks newer - installing it would quit `tauri dev`.
  if (import.meta.env.DEV) {
    return;
  }

  try {
    const update = await check();
    if (!update) {
      return;
    }
    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    console.error("Update check failed:", error);
  }
}
