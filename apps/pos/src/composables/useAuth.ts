import { ref } from "vue";
import { login as apiLogin, onUnauthorized } from "../lib/api";
import type { AuthSession } from "../types/auth";

const STORAGE_KEY = "pos.session";

function loadStoredSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

const session = ref<AuthSession | null>(loadStoredSession());
// Set when the server rejected the saved session, so the login screen can say
// why the cashier was sent back to it.
const sessionEnded = ref(false);

function clearSession() {
  session.value = null;
  localStorage.removeItem(STORAGE_KEY);
}

// Only the current session's token counts: a late reply to a request sent
// with an earlier token mustn't log out a cashier who has since logged in.
onUnauthorized((token) => {
  if (session.value?.token === token) {
    sessionEnded.value = true;
    clearSession();
  }
});

export function useAuth() {
  async function login(pin: string) {
    const result = await apiLogin(pin);
    session.value = result;
    sessionEnded.value = false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  }

  function logout() {
    sessionEnded.value = false;
    clearSession();
  }

  return { session, sessionEnded, login, logout };
}
