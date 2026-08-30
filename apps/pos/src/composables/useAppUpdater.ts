import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

// A failed or offline check must never block the register from opening -
// this is a best-effort background action, called once at cold start.
export async function checkForUpdateAndInstall() {
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
