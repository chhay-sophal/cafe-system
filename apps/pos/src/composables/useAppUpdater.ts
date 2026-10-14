import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

// Dev builds carry the placeholder version from tauri.conf.json, so any
// published release looks newer - installing it would quit `tauri dev`.
export const updatesEnabled = !import.meta.env.DEV;

// A failed or offline check must never block the register from opening -
// this is a best-effort background action, called once at cold start.
export async function checkForUpdateAndInstall() {
  if (!updatesEnabled) {
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

// Manual check from Settings → About. Unlike the startup check this reports
// back (null = already up to date) and throws on failure, so the screen can
// show the result; installing waits for the cashier to confirm.
export async function checkForUpdate(): Promise<Update | null> {
  return check();
}

export async function installUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}
