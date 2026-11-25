import { onBeforeUnmount, watch } from "vue";

// Closing a popup by clicking outside it (on its dimmed backdrop) or with
// Escape. Every IMS popup uses it, so they all behave the same:
//   - The click only counts when it both starts and ends on the backdrop, so
//     selecting text in a field and letting go outside doesn't close it.
//   - Escape closes only the topmost popup (a confirm opened from another
//     popup closes before the one under it).
//   - Neither works while `isBusy` - a save or delete in flight.
// Use: `const dismiss = useDismiss(() => open.value, close, () => isSaving.value)`
// and on the backdrop `@pointerdown="dismiss.onPointerDown" @click="dismiss.onClick"`.

interface Entry {
  close: () => void;
  isBusy: () => boolean;
}

// Open popups, oldest first - Escape goes to the last one.
const openStack: Entry[] = [];

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.defaultPrevented) {
    return;
  }
  const top = openStack.at(-1);
  if (top && !top.isBusy()) {
    event.preventDefault();
    top.close();
  }
}

function syncListener() {
  if (!import.meta.client) {
    return;
  }
  window.removeEventListener("keydown", handleKeydown);
  if (openStack.length > 0) {
    window.addEventListener("keydown", handleKeydown);
  }
}

export function useDismiss(isOpen: () => boolean, close: () => void, isBusy: () => boolean = () => false) {
  const entry: Entry = { close, isBusy };

  function remove() {
    const index = openStack.indexOf(entry);
    if (index !== -1) {
      openStack.splice(index, 1);
      syncListener();
    }
  }

  watch(
    isOpen,
    (open) => {
      remove();
      if (open) {
        openStack.push(entry);
        syncListener();
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(remove);

  let pressedOnBackdrop = false;

  return {
    onPointerDown(event: PointerEvent) {
      pressedOnBackdrop = event.target === event.currentTarget;
    },
    onClick(event: MouseEvent) {
      const onBackdrop = pressedOnBackdrop && event.target === event.currentTarget;
      pressedOnBackdrop = false;
      if (onBackdrop && !isBusy()) {
        close();
      }
    },
  };
}
