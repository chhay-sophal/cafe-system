import { ref } from "vue";
import { resolveImageUrl } from "../lib/image";
import { notifyPosSettingChanged } from "../lib/settingsEvents";

const STORAGE_KEY = "pos.khqrBanks";
// Plenty for a phone camera to scan off the customer screen, while keeping
// each saved image small - localStorage only holds a few MB in total.
const MAX_QR_SIZE_PX = 600;

export interface KhqrBank {
  id: string;
  name: string;
  // What checkout shows: a PNG data URL kept on this register, so the QR
  // still shows offline. (Falls back to the server URL if it couldn't be
  // downloaded.)
  qrImage: string;
  // The image's copy on the server, once uploaded (see usePosSettingsSync) -
  // what the shared setting and IMS refer to.
  imageUrl?: string;
}

function loadBanks(): KhqrBank[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Store-wide, shared with the server and IMS (usePosSettingsSync), with each
// QR image also kept here so checkout needs no server round trip.
const banks = ref<KhqrBank[]>(loadBanks());

function store(next: KhqrBank[]) {
  // Write first so a full localStorage throws before the UI shows a bank
  // that wouldn't survive a restart.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  banks.value = next;
}

// A change made here - shared with the server (settingsEvents).
function save(next: KhqrBank[]) {
  store(next);
  notifyPosSettingChanged("khqrBanks");
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Not a readable image"));
    };
    image.src = url;
  });
}

// Scales down (never up) and re-encodes as PNG - lossless, so the QR's
// sharp module edges stay scannable.
async function toQrDataUrl(file: File): Promise<string> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_QR_SIZE_PX / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable");
  }
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

async function addBank(name: string, qrFile: File): Promise<void> {
  const qrImage = await toQrDataUrl(qrFile);
  save([...banks.value, { id: crypto.randomUUID(), name: name.trim(), qrImage }]);
}

function removeBank(id: string) {
  save(banks.value.filter((bank) => bank.id !== id));
}

// After the sync uploads a bank's image - not a change to announce.
function setImageUrl(id: string, imageUrl: string) {
  store(banks.value.map((bank) => (bank.id === id ? { ...bank, imageUrl } : bank)));
}

async function downloadAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Image download failed (${response.status})`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// The shared setting as the server has it. Images already kept here for the
// same server copy are reused; new ones are downloaded once.
async function applyFromServer(serverBanks: Array<{ id: string; name: string; imageUrl: string }>) {
  const next = await Promise.all(serverBanks.map(async (bank): Promise<KhqrBank> => {
    const kept = banks.value.find((existing) => existing.id === bank.id && existing.imageUrl === bank.imageUrl);
    if (kept) {
      return { ...kept, name: bank.name };
    }
    const resolved = resolveImageUrl(bank.imageUrl) ?? bank.imageUrl;
    const qrImage = await downloadAsDataUrl(resolved).catch(() => resolved);
    return { id: bank.id, name: bank.name, qrImage, imageUrl: bank.imageUrl };
  }));
  store(next);
}

export function useKhqrBanks() {
  return { banks, addBank, removeBank, setImageUrl, applyFromServer };
}
