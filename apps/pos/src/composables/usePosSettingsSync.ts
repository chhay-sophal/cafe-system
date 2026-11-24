import { computed, ref } from "vue";
import { i18n, setLocale } from "../i18n";
import { fetchPosSettings, HttpError, savePosSettings, uploadImage } from "../lib/api";
import { onPosSettingChanged, type PosSettingsSection } from "../lib/settingsEvents";
import type { PosSettings, PosSettingsResponse } from "../types/settings";
import { useAuth } from "./useAuth";
import { useFastCash } from "./useFastCash";
import { useKhqrBanks } from "./useKhqrBanks";
import { useMenuDisplay } from "./useMenuDisplay";
import { usePaymentMethods } from "./usePaymentMethods";
import { useStoreDetails } from "./useStoreDetails";
import { useStoreName } from "./useStoreName";

// Keeps the store-wide POS settings (store name & details, payment methods,
// fast cash, KHQR banks, language, hiding unavailable items) in step with the server, where IMS edits
// them too.
// The composables keep their local copies, so checkout works offline; this
// moves changes both ways:
//   - from the server (syncPosSettings): on start, login, Refresh menu - the
//     same moments the menu reloads. Sections with unsent local changes are
//     left alone, so an offline edit isn't overwritten by older server data.
//   - to the server: every change made here is queued ("pending", kept
//     across restarts) and sent right away when a manager or admin is logged
//     in and the server is reachable, otherwise retried later.
// Sections the server has never had (all of them on first run, or one added
// later, like language) are queued for upload from this register rather than
// replaced by defaults - nothing set up on this register is lost.

const PENDING_STORAGE_KEY = "pos.settingsPending";
const ALL_SECTIONS: PosSettingsSection[] = [
  "storeName",
  "storeDetails",
  "paymentMethods",
  "fastCash",
  "khqrBanks",
  "language",
  "hideUnavailableItems",
];
// PUT /api/settings/pos is for managers and admins only.
const SAVE_ROLES = ["MANAGER", "ADMIN"];

function loadPending(): Set<PosSettingsSection> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PENDING_STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? ALL_SECTIONS.filter((section) => parsed.includes(section)) : []);
  } catch {
    return new Set();
  }
}

const pending = ref(loadPending());
// Bumped on every local change, so a save that was in flight while the same
// section changed again doesn't mark the newer change as sent.
const revisions = new Map<PosSettingsSection, number>();
let isPushing = false;
const lastPushError = ref<string | null>(null);

function persistPending() {
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify([...pending.value]));
}

function markPending(sections: PosSettingsSection[]) {
  const next = new Set(pending.value);
  for (const section of sections) {
    next.add(section);
    revisions.set(section, (revisions.get(section) ?? 0) + 1);
  }
  pending.value = next;
  persistPending();
}

onPosSettingChanged((section) => {
  markPending([section]);
  void pushPending();
});

// A data URL as a file for the upload endpoint.
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

// The local value of a section, in the server's shape. KHQR images that only
// exist on this register are uploaded first.
async function sectionValue(section: PosSettingsSection, token: string): Promise<Partial<PosSettings>> {
  switch (section) {
    case "storeName":
      return { storeName: useStoreName().customName.value };
    case "storeDetails": {
      const { address, phones, emails, socials } = useStoreDetails().details.value;
      return { storeDetails: { address, phones, emails, socials } };
    }
    case "paymentMethods":
      return { paymentMethods: [...usePaymentMethods().enabledMethods.value] };
    case "fastCash": {
      const { amounts } = useFastCash();
      return { fastCash: { USD: [...amounts.USD.value], KHR: [...amounts.KHR.value] } };
    }
    case "language":
      return { language: i18n.global.locale.value as PosSettings["language"] };
    case "hideUnavailableItems":
      return { hideUnavailableItems: useMenuDisplay().hideUnavailableItems.value };
    case "khqrBanks": {
      const khqr = useKhqrBanks();
      for (const bank of khqr.banks.value) {
        if (!bank.imageUrl && bank.qrImage.startsWith("data:")) {
          const url = await uploadImage(await dataUrlToBlob(bank.qrImage), `khqr-${bank.id}.png`, token);
          khqr.setImageUrl(bank.id, url);
        }
      }
      return {
        khqrBanks: khqr.banks.value
          .filter((bank) => bank.imageUrl || !bank.qrImage.startsWith("data:"))
          .map((bank) => ({ id: bank.id, name: bank.name, imageUrl: bank.imageUrl ?? bank.qrImage })),
      };
    }
  }
}

// Sends queued local changes, if a manager/admin is logged in. Safe to call
// any time - it does nothing when there's nothing to send.
async function pushPending(): Promise<void> {
  const session = useAuth().session.value;
  if (isPushing || pending.value.size === 0 || !session || !SAVE_ROLES.includes(session.user.role)) {
    return;
  }
  isPushing = true;
  const sections = [...pending.value];
  const sentRevisions = new Map(sections.map((section) => [section, revisions.get(section) ?? 0]));
  try {
    let update: Partial<PosSettings> = {};
    for (const section of sections) {
      update = { ...update, ...(await sectionValue(section, session.token)) };
    }
    await savePosSettings(update, session.token);
    const next = new Set(pending.value);
    for (const section of sections) {
      if ((revisions.get(section) ?? 0) === sentRevisions.get(section)) {
        next.delete(section);
      }
    }
    pending.value = next;
    persistPending();
    lastPushError.value = null;
  } catch (error) {
    // Offline, or rejected - kept pending either way; a rejection is shown in
    // Settings so a manager can see why it isn't saving.
    lastPushError.value = error instanceof HttpError ? error.message : null;
  } finally {
    isPushing = false;
  }
}

// Brings the register up to date with the server, then sends anything queued.
// `prefetched` is the response already loaded with the menu (the POS
// bootstrap), saving a request; without it the settings are fetched here.
async function syncPosSettings(prefetched?: PosSettingsResponse): Promise<void> {
  let response = prefetched;
  if (!response) {
    try {
      response = await fetchPosSettings();
    } catch {
      return; // Unreachable - keep the local copies.
    }
  }

  // Never saved on the server: this register's value becomes the shared one
  // (sent once a manager/admin is logged in). Older servers don't list them,
  // so fall back to "all" when unconfigured.
  const unset = new Set<PosSettingsSection>(response.unsetSections ?? (response.configured ? [] : ALL_SECTIONS));
  markPending(ALL_SECTIONS.filter((section) => unset.has(section) && !pending.value.has(section)));

  // Everything else comes from the server - except sections with changes
  // made here that haven't been sent yet.
  const { settings } = response;
  const take = (section: PosSettingsSection) => !pending.value.has(section);
  if (take("storeName")) useStoreName().setStoreName(settings.storeName, { fromServer: true });
  if (take("storeDetails")) useStoreDetails().applyFromServer(settings.storeDetails);
  if (take("paymentMethods")) usePaymentMethods().applyFromServer(settings.paymentMethods);
  if (take("fastCash")) useFastCash().applyFromServer(settings.fastCash);
  if (take("language")) setLocale(settings.language, { fromServer: true });
  if (take("hideUnavailableItems")) useMenuDisplay().applyFromServer(settings.hideUnavailableItems);
  if (take("khqrBanks")) await useKhqrBanks().applyFromServer(settings.khqrBanks).catch(() => {});

  await pushPending();
}

const pendingCount = computed(() => pending.value.size);

export function usePosSettingsSync() {
  return { syncPosSettings, pushPending, pendingCount, lastPushError };
}
