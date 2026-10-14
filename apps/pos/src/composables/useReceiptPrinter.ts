import { invoke } from "@tauri-apps/api/core";
import { ref } from "vue";
import {
  BOTTOM_MARGIN_MM,
  encodeEscPosRaster,
  loadReceiptFonts,
  PAPER_WIDTH_DOTS,
  renderReceipt,
  type BottomMarginMm,
  type PaperSize,
  type ReceiptBlock,
} from "../lib/receipt";

const PRINTER_STORAGE_KEY = "pos.receiptPrinter";
const PAPER_SIZE_STORAGE_KEY = "pos.receiptPaperSize";
const BOTTOM_MARGIN_STORAGE_KEY = "pos.receiptBottomMarginMm";

// Per-register choice (each till has its own USB printer), so it lives in
// localStorage rather than in the store-wide settings from the backend.
const printerName = ref<string | null>(localStorage.getItem(PRINTER_STORAGE_KEY));
const availablePrinters = ref<string[]>([]);

// Also per register - each till's printer takes its own roll width. Defaults
// to 58mm, the size receipts were always laid out for before this setting.
function loadPaperSize(): PaperSize {
  const stored = localStorage.getItem(PAPER_SIZE_STORAGE_KEY);
  return stored !== null && stored in PAPER_WIDTH_DOTS ? (stored as PaperSize) : "58mm";
}

const paperSize = ref<PaperSize>(loadPaperSize());

// Also per register - the tear bar's distance above the print head differs
// between printer models. 30mm suits most.
function loadBottomMargin(): BottomMarginMm {
  const stored = Number(localStorage.getItem(BOTTOM_MARGIN_STORAGE_KEY));
  return (BOTTOM_MARGIN_MM as readonly number[]).includes(stored) ? (stored as BottomMarginMm) : 30;
}

const bottomMarginMm = ref<BottomMarginMm>(loadBottomMargin());

async function refreshPrinters(): Promise<void> {
  try {
    availablePrinters.value = await invoke<string[]>("list_printers");
  } catch (error) {
    console.error("Failed to list printers:", error);
    availablePrinters.value = [];
  }
}

function setPrinter(name: string | null) {
  printerName.value = name;
  if (name) {
    localStorage.setItem(PRINTER_STORAGE_KEY, name);
  } else {
    localStorage.removeItem(PRINTER_STORAGE_KEY);
  }
}

function setPaperSize(size: PaperSize) {
  paperSize.value = size;
  localStorage.setItem(PAPER_SIZE_STORAGE_KEY, size);
}

function setBottomMargin(mm: BottomMarginMm) {
  bottomMarginMm.value = mm;
  localStorage.setItem(BOTTOM_MARGIN_STORAGE_KEY, String(mm));
}

// Rejects with the spooler's message (printer offline, wrong name, driver
// refusing RAW data) so the checkout screen can show it and offer a reprint.
async function printReceipt(blocks: ReceiptBlock[]): Promise<void> {
  if (!printerName.value) {
    throw new Error("No receipt printer selected");
  }

  await loadReceiptFonts();
  const data = encodeEscPosRaster(renderReceipt(blocks, paperSize.value), bottomMarginMm.value);
  await invoke("print_raw", { printerName: printerName.value, data: Array.from(data) });
}

export function useReceiptPrinter() {
  return {
    printerName,
    availablePrinters,
    paperSize,
    bottomMarginMm,
    refreshPrinters,
    setPrinter,
    setPaperSize,
    setBottomMargin,
    printReceipt,
  };
}
