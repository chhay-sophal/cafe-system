// Product images are stored as relative paths (e.g. "/uploads/products/x.jpg")
// served by the backend, which runs on a different origin/port than this app -
// a bare relative path would resolve against the IMS app's own origin and 404.
export function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const apiBase = useRuntimeConfig().public.apiBase;
  return `${apiBase}${path.startsWith("/") ? "" : "/"}${path}`;
}
