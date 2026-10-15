import type { Directive } from "vue";

// Khmer digits ០-៩ are U+17E0-U+17E9, in order.
const KHMER_DIGITS = /[០-៩]/g;

export function toWesternDigits(text: string): string {
  return text.replace(KHMER_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x17e0));
}

// Western digits, at most one ".", and (when allowed) one "-" at the very start.
function normalizeValue(value: string, allowNegative: boolean): string {
  const converted = toWesternDigits(value);
  const isNegative = allowNegative && converted.trimStart().startsWith("-");
  const [whole = "", ...fraction] = converted.replace(/[^0-9.]/g, "").split(".");
  const number = fraction.length > 0 ? `${whole}.${fraction.join("")}` : whole;
  return isNegative ? `-${number}` : number;
}

// v-model.number on a text input passes through anything parseFloat can't read
// (a half-typed "-" or ".") as a string, so validate with this, not `!== null`.
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const allowNegativeByElement = new WeakMap<HTMLInputElement, boolean>();

// Typing/pasting: rewrite the inserted text before the browser commits it, so
// every "input" listener (v-model included) only ever sees the clean value.
function onBeforeInput(event: InputEvent) {
  const el = event.target as HTMLInputElement;
  if (event.isComposing || event.data === null || !event.inputType.startsWith("insert")) {
    return;
  }

  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const next = normalizeValue(before + event.data + after, allowNegativeByElement.get(el) ?? false);
  if (next === before + event.data + after) {
    return;
  }

  event.preventDefault();
  const caret = Math.max(0, next.length - after.length);
  el.value = next;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// Fallback for text that skips beforeinput or can't be cancelled there (IME
// composition, drag-and-drop, autofill): clean the value after the fact.
// Registered in the capture phase, so at the target it runs before v-model's
// and the component's own listeners; those then get the cleaned value.
function onInput(event: Event) {
  if ((event as InputEvent).isComposing) {
    return;
  }
  const el = event.target as HTMLInputElement;
  const next = normalizeValue(el.value, allowNegativeByElement.get(el) ?? false);
  if (next === el.value) {
    return;
  }

  event.stopImmediatePropagation();
  const caret = Math.max(0, (el.selectionStart ?? next.length) - (el.value.length - next.length));
  el.value = next;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function onCompositionEnd(event: CompositionEvent) {
  onInput(event);
}

/**
 * v-numeric: for number fields rendered as <input type="text" inputmode="decimal">.
 * Converts Khmer digits to Western ones as they're typed and drops anything that
 * isn't part of a number. `type="number"` can't be used: browsers silently reject
 * Khmer digits there before any script sees them. Add `.signed` to allow a leading "-".
 */
export const vNumeric: Directive<HTMLInputElement> = {
  created(el, binding) {
    allowNegativeByElement.set(el, Boolean(binding.modifiers.signed));
    el.addEventListener("beforeinput", onBeforeInput, { capture: true });
    el.addEventListener("input", onInput, { capture: true });
    el.addEventListener("compositionend", onCompositionEnd, { capture: true });
  },
  updated(el, binding) {
    allowNegativeByElement.set(el, Boolean(binding.modifiers.signed));
  },
  beforeUnmount(el) {
    el.removeEventListener("beforeinput", onBeforeInput, { capture: true });
    el.removeEventListener("input", onInput, { capture: true });
    el.removeEventListener("compositionend", onCompositionEnd, { capture: true });
  },
};
