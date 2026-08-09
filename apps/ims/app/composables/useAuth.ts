import type { AuthSession } from "~/types/auth";

const STORAGE_KEY = "ims.session";
const MANAGER_ROLES = new Set(["MANAGER", "ADMIN"]);

function loadStoredSession(): AuthSession | null {
  if (!import.meta.client) {
    return null;
  }

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

export function useAuth() {
  const session = useState<AuthSession | null>("ims-auth-session", () => loadStoredSession());

  async function login(pin: string) {
    const { login: apiLogin } = useApi();
    const result = await apiLogin(pin);

    if (!MANAGER_ROLES.has(result.user.role)) {
      throw new Error("This PIN does not have manager access to inventory.");
    }

    session.value = result;
    if (import.meta.client) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    }
  }

  function logout() {
    session.value = null;
    if (import.meta.client) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return { session, login, logout };
}
