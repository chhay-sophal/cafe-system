import { invoke } from "@tauri-apps/api/core";
import { ref } from "vue";
import { encodeEscPosRaster, loadReceiptFonts, renderReceipt, type ReceiptBlock } from "../lib/receipt";

const PRINTER_STORAGE_KEY = "pos.receiptPrinter";

// Per-register choice (each till has its own USB printer), so it lives in
// localStorage rather than in the store-wide settings from the backend.
const printerName = ref<string | null>(localStorage.getItem(PRINTER_STORAGE_KEY));
const availablePrinters = ref<string[]>([]);

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

// Rejects with the spooler's message (printer offline, wrong name, driver
// refusing RAW data) so the checkout screen can show it and offer a reprint.
async function printReceipt(blocks: ReceiptBlock[]): Promise<void> {
  if (!printerName.value) {
    throw new Error("No receipt printer selected");
  }

  await loadReceiptFonts();
  const data = encodeEscPosRaster(renderReceipt(blocks));
  await invoke("print_raw", { printerName: printerName.value, data: Array.from(data) });
}

export function useReceiptPrinter() {
  return { printerName, availablePrinters, refreshPrinters, setPrinter, printReceipt };
}
