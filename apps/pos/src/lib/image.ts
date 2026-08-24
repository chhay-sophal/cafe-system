import { API_BASE_URL } from "./api";

// Product images are stored as relative paths (e.g. "/uploads/products/x.jpg")
// served by the backend, which runs on a different origin/port than this app -
// a bare relative path would resolve against the POS app's own origin and 404.
export function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
