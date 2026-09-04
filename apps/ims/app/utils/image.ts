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

// Product photos only ever render as small thumbnails - a 64px preview in
// this app's own modal, up to ~220px grid tiles in the POS. 640px covers
// that at 3x pixel density with room to spare, so anything already at or
// under this byte size is left untouched rather than re-compressed for no
// visible benefit.
const MAX_DIMENSION_PX = 640;
const SKIP_RESIZE_BELOW_BYTES = 300 * 1024;
const JPEG_QUALITY = 0.82;

export async function resizeImageForUpload(file: File): Promise<File> {
  if (file.size <= SKIP_RESIZE_BELOW_BYTES) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));

    // Dimensions are already within budget - the byte weight comes from
    // something else (an unusually dense encode), and redrawing won't help.
    if (scale >= 1) {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }

    // PNG keeps transparency (e.g. a logo-style product icon); every other
    // source type re-encodes as JPEG, which has no alpha channel - fill white
    // first so a transparent source doesn't composite unpredictably.
    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    if (outputType === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outputType, outputType === "image/jpeg" ? JPEG_QUALITY : undefined),
    );
    if (!blob) {
      return file;
    }

    const extension = outputType === "image/png" ? ".png" : ".jpg";
    const baseName = file.name.replace(/\.[^./]+$/, "");
    return new File([blob], `${baseName}${extension}`, { type: outputType });
  } catch {
    // Resizing is an optimization, not a requirement - if the browser can't
    // decode this file client-side, let the original through and leave the
    // backend's own validation as the final word.
    return file;
  }
}
