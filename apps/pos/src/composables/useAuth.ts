import { ref } from "vue";
import { login as apiLogin } from "../lib/api";
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

export function useAuth() {
  async function login(pin: string) {
    const result = await apiLogin(pin);
    session.value = result;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  }

  function logout() {
    session.value = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  return { session, login, logout };
}
