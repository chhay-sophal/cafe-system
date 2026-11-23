// The POS settings that are shared with the server (and IMS) - see
// composables/usePosSettingsSync.ts. Each composable announces a change the
// cashier/manager made here, so the sync can send it; values applied FROM
// the server don't announce, or every sync would echo straight back.
export type PosSettingsSection = "storeName" | "storeDetails" | "paymentMethods" | "fastCash" | "khqrBanks";

let listener: ((section: PosSettingsSection) => void) | null = null;

export function onPosSettingChanged(handler: (section: PosSettingsSection) => void): void {
  listener = handler;
}

export function notifyPosSettingChanged(section: PosSettingsSection): void {
  listener?.(section);
}
