import { ref } from "vue";
import { notifyPosSettingChanged } from "../lib/settingsEvents";

const STORAGE_KEY = "pos.hideUnavailableItems";

// Store-wide, shared with the server and IMS (usePosSettingsSync), and kept
// here too for offline use. Off by default: unavailable items show greyed
// out with a "Sold out" badge, as they always have.
const hideUnavailableItems = ref(localStorage.getItem(STORAGE_KEY) === "true");

function store(value: boolean) {
  hideUnavailableItems.value = value;
  localStorage.setItem(STORAGE_KEY, String(value));
}

function setHideUnavailableItems(value: boolean) {
  store(value);
  notifyPosSettingChanged("hideUnavailableItems");
}

// The shared setting as the server has it.
function applyFromServer(value: unknown) {
  store(value === true);
}

export function useMenuDisplay() {
  return { hideUnavailableItems, setHideUnavailableItems, applyFromServer };
}
