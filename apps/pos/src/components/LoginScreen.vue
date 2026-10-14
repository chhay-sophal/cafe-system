<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useAuth } from "../composables/useAuth";
import { useStoreName } from "../composables/useStoreName";
import { setLocale } from "../i18n";

const { t, locale } = useI18n({ useScope: "global" });
const { storeName } = useStoreName();
const auth = useAuth();

// Staff PINs are always exactly 4 digits (enforced by the backend and IMS),
// so the 4th digit submits on its own - no Log In button to reach for.
const PIN_LENGTH = 4;

const pin = ref("");
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

function pressDigit(digit: string) {
  if (pin.value.length >= PIN_LENGTH || isSubmitting.value) {
    return;
  }
  errorMessage.value = null;
  pin.value += digit;
  if (pin.value.length === PIN_LENGTH) {
    submit();
  }
}

function pressBackspace() {
  if (isSubmitting.value) {
    return;
  }
  errorMessage.value = null;
  pin.value = pin.value.slice(0, -1);
}

function pressClear() {
  if (isSubmitting.value) {
    return;
  }
  errorMessage.value = null;
  pin.value = "";
}

// A physical keyboard (or a numpad) works alongside the on-screen keypad:
// digits type, Backspace deletes, Escape/Delete clears. Listens on the whole
// window since there's no text box to focus any more.
function handleKeydown(event: KeyboardEvent) {
  // Leave shortcuts (Ctrl+R, Alt+F4...) and the language picker alone.
  if (event.ctrlKey || event.altKey || event.metaKey || event.target instanceof HTMLSelectElement) {
    return;
  }

  if (/^[0-9]$/.test(event.key)) {
    pressDigit(event.key);
  } else if (event.key === "Backspace") {
    pressBackspace();
  } else if (event.key === "Escape" || event.key === "Delete") {
    pressClear();
  } else {
    return;
  }
  event.preventDefault();
}

onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleKeydown));

async function submit() {
  if (pin.value.length !== PIN_LENGTH || isSubmitting.value) {
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = null;

  try {
    await auth.login(pin.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t("login.genericError");
    pin.value = "";
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="login-screen">
    <div class="login-card">
      <div class="login-card__locale-row">
        <select
          :value="locale"
          class="login-card__locale"
          @change="setLocale(($event.target as HTMLSelectElement).value as 'en-US' | 'km-KH')"
        >
          <option value="en-US">English</option>
          <option value="km-KH">ខ្មែរ</option>
        </select>
      </div>
      <h1 class="login-card__title">{{ storeName }}</h1>
      <p class="login-card__subtitle">{{ t("login.subtitle") }}</p>

      <!-- One hole per PIN digit, filled as digits are entered. -->
      <div
        class="login-pin"
        role="status"
        :aria-label="t('login.pinProgress', { count: pin.length, total: PIN_LENGTH })"
      >
        <span
          v-for="index in PIN_LENGTH"
          :key="index"
          class="login-pin__hole"
          :class="{ 'login-pin__hole--filled': index <= pin.length }"
        />
      </div>

      <p v-if="isSubmitting" class="login-card__status" aria-live="polite">{{ t("login.loggingIn") }}</p>
      <p v-else-if="errorMessage" class="login-card__error" aria-live="polite">{{ errorMessage }}</p>
      <p v-else class="login-card__status">{{ t("login.keyboardHint") }}</p>

      <div class="login-keypad">
        <button
          v-for="digit in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
          :key="digit"
          type="button"
          class="login-keypad__key"
          :disabled="isSubmitting"
          @click="pressDigit(digit)"
        >
          {{ digit }}
        </button>
        <button type="button" class="login-keypad__key login-keypad__key--muted" :disabled="isSubmitting" @click="pressClear">
          {{ t("common.clear") }}
        </button>
        <button type="button" class="login-keypad__key" :disabled="isSubmitting" @click="pressDigit('0')">0</button>
        <button type="button" class="login-keypad__key login-keypad__key--muted" :disabled="isSubmitting" @click="pressBackspace">
          &larr;
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: #f6f6f6;
}

.login-card {
  width: 100%;
  max-width: 340px;
  padding: 2rem;
  border-radius: 20px;
  background: #ffffff;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
  text-align: center;
}

.login-card__locale-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.login-card__locale {
  border: 2px solid #dcdcdc;
  background: #ffffff;
  color: #1a1a1a;
  border-radius: 8px;
  padding: 0.3rem 0.5rem;
  font-size: 0.85rem;
}

.login-card__title {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111111;
}

.login-card__subtitle {
  margin: 0 0 1.25rem;
  color: #666666;
  font-size: 0.95rem;
}

.login-pin {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.login-pin__hole {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #b5b5b5;
  transition:
    background-color 0.1s ease,
    border-color 0.1s ease;
}

.login-pin__hole--filled {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

/* Fixed height so switching between hint, "Logging in..." and an error
   doesn't shift the keypad. */
.login-card__status,
.login-card__error {
  min-height: 1.4em;
  margin: 0 0 1rem;
  font-size: 0.9rem;
}

.login-card__status {
  color: #777777;
}

.login-card__error {
  color: #c0392b;
  font-weight: 600;
}

.login-keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.6rem;
}

.login-keypad__key {
  min-height: 56px;
  border-radius: 12px;
  border: 2px solid #dcdcdc;
  background: #ffffff;
  font-size: 1.3rem;
  font-weight: 700;
  color: #111111;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.1s ease;
}

.login-keypad__key:active:not(:disabled) {
  transform: scale(0.94);
}

.login-keypad__key:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.login-keypad__key--muted {
  font-size: 0.95rem;
  color: #666666;
}

/* Dark theme: data-theme is set on <html> by composables/useTheme.ts. :where()
   keeps these rules at their own specificity, so they override light styles
   exactly as the prefers-color-scheme media query used to. */
:where(:root[data-theme="dark"]) .login-screen {
  background: #1a1a1a;
}

:where(:root[data-theme="dark"]) .login-card {
  background: #242424;
}

:where(:root[data-theme="dark"]) .login-card__title {
  color: #f2f2f2;
}

:where(:root[data-theme="dark"]) .login-card__locale {
  background: #2a2a2a;
  border-color: #444444;
  color: #f2f2f2;
}

:where(:root[data-theme="dark"]) .login-pin__hole {
  border-color: #5a5a5a;
}

:where(:root[data-theme="dark"]) .login-pin__hole--filled {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

:where(:root[data-theme="dark"]) .login-card__status {
  color: #999999;
}

:where(:root[data-theme="dark"]) .login-card__error {
  color: #ff8a7a;
}

:where(:root[data-theme="dark"]) .login-keypad__key {
  background: #2a2a2a;
  border-color: #444444;
  color: #f2f2f2;
}
</style>
