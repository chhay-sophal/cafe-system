import { ref } from "vue";

const STORAGE_KEY = "pos.khqrBanks";
// Plenty for a phone camera to scan off the customer screen, while keeping
// each saved image small - localStorage only holds a few MB in total.
const MAX_QR_SIZE_PX = 600;

export interface KhqrBank {
  id: string;
  name: string;
  // PNG data URL of the bank's static KHQR code.
  qrImage: string;
}

function loadBanks(): KhqrBank[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Per-register, like the receipt printer: the QR images live with the
// register that shows them, with no backend round trip at checkout.
const banks = ref<KhqrBank[]>(loadBanks());

function save(next: KhqrBank[]) {
  // Write first so a full localStorage throws before the UI shows a bank
  // that wouldn't survive a restart.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  banks.value = next;
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

export function useKhqrBanks() {
  return { banks, addBank, removeBank };
}
