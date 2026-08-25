<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useAuth } from "../composables/useAuth";
import { setLocale } from "../i18n";

const { t, locale } = useI18n({ useScope: "global" });
const auth = useAuth();

const pin = ref("");
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

const maskedPin = computed(() => "•".repeat(pin.value.length));

function pressDigit(digit: string) {
  if (pin.value.length >= 8) {
    return;
  }
  errorMessage.value = null;
  pin.value += digit;
}

function pressBackspace() {
  errorMessage.value = null;
  pin.value = pin.value.slice(0, -1);
}

function pressClear() {
  errorMessage.value = null;
  pin.value = "";
}

async function submit() {
  if (pin.value.length === 0 || isSubmitting.value) {
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
      <h1 class="login-card__title">{{ t("app.title") }}</h1>
      <p class="login-card__subtitle">{{ t("login.subtitle") }}</p>

      <div class="login-card__pin-display" aria-live="polite">
        <span v-if="pin.length > 0">{{ maskedPin }}</span>
        <span v-else class="login-card__pin-placeholder">{{ t("login.enterPin") }}</span>
      </div>

      <p v-if="errorMessage" class="login-card__error">{{ errorMessage }}</p>

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

      <button
        type="button"
        class="login-card__submit"
        :disabled="pin.length === 0 || isSubmitting"
        @click="submit"
      >
        {{ isSubmitting ? t("login.loggingIn") : t("login.logIn") }}
      </button>
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

.login-card__pin-display {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  letter-spacing: 0.4rem;
  font-weight: 700;
  color: #111111;
  border: 2px solid #dcdcdc;
  border-radius: 12px;
  margin-bottom: 0.75rem;
}

.login-card__pin-placeholder {
  font-size: 1rem;
  letter-spacing: normal;
  font-weight: 500;
  color: #999999;
}

.login-card__error {
  margin: 0 0 0.75rem;
  color: #c0392b;
  font-size: 0.9rem;
  font-weight: 600;
}

.login-keypad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.6rem;
  margin-bottom: 1.25rem;
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

.login-card__submit {
  width: 100%;
  min-height: 52px;
  border-radius: 12px;
  border: 2px solid #111111;
  background: #111111;
  color: #ffffff;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}

.login-card__submit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@media (prefers-color-scheme: dark) {
  .login-screen {
    background: #1a1a1a;
  }

  .login-card {
    background: #242424;
  }

  .login-card__title {
    color: #f2f2f2;
  }

  .login-card__locale {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .login-card__pin-display {
    color: #f2f2f2;
    border-color: #444444;
  }

  .login-keypad__key {
    background: #2a2a2a;
    border-color: #444444;
    color: #f2f2f2;
  }

  .login-card__submit {
    background: #ffffff;
    border-color: #ffffff;
    color: #111111;
  }
}
</style>
