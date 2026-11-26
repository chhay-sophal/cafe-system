import QRCode from "qrcode";
import { computed, onScopeDispose, ref } from "vue";
import { createKhqr, fetchKhqrStatus, HttpError, type Khqr } from "../lib/api";

// One Mobile Pay checkout through Bakong KHQR: ask the backend for a QR with
// the sale's exact amount, draw it, then ask every few seconds whether it's
// been paid - calling onPaid once Bakong says so. A QR is good for a few
// minutes (the backend sets when); after that it's "expired" and a new one
// can be made.
export type KhqrState = "idle" | "creating" | "waiting" | "paid" | "expired" | "error";

const POLL_INTERVAL_MS = 3000;

export function useKhqrPayment(options: { token: () => string; onPaid: (md5: string) => void }) {
  const state = ref<KhqrState>("idle");
  const khqr = ref<Khqr | null>(null);
  const image = ref<string | null>(null);
  const error = ref<string | null>(null);
  const now = ref(Date.now());

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let isChecking = false;
  // Bumped on every start/reset, so a slow answer for an old QR is ignored.
  let generation = 0;

  const secondsLeft = computed(() =>
    khqr.value ? Math.max(0, Math.ceil((Date.parse(khqr.value.expiresAt) - now.value) / 1000)) : 0,
  );

  function stopTimers() {
    if (pollTimer) clearInterval(pollTimer);
    if (tickTimer) clearInterval(tickTimer);
    pollTimer = null;
    tickTimer = null;
  }

  async function check(current: number) {
    if (isChecking || !khqr.value) return;
    if (Date.now() >= Date.parse(khqr.value.expiresAt)) {
      stopTimers();
      state.value = "expired";
      return;
    }
    isChecking = true;
    try {
      const { status } = await fetchKhqrStatus(khqr.value.md5, options.token());
      if (current !== generation) return;
      if (status === "PAID") {
        stopTimers();
        state.value = "paid";
        options.onPaid(khqr.value.md5);
      }
    } catch (checkError) {
      // Payment checks not set up (no Bakong email) won't fix itself - say
      // so. Anything else (Bakong slow, a dropped request) is retried on the
      // next tick.
      if (current === generation && checkError instanceof HttpError && checkError.status === 409) {
        stopTimers();
        state.value = "error";
        error.value = checkError.message;
      }
    } finally {
      isChecking = false;
    }
  }

  async function start(amount: number, currency: "USD" | "KHR") {
    reset();
    const current = generation;
    state.value = "creating";
    try {
      const created = await createKhqr(amount, currency, options.token());
      const dataUrl = await QRCode.toDataURL(created.qrString, { margin: 1, width: 480, errorCorrectionLevel: "M" });
      if (current !== generation) return;
      khqr.value = created;
      image.value = dataUrl;
      state.value = "waiting";
      now.value = Date.now();
      tickTimer = setInterval(() => (now.value = Date.now()), 1000);
      pollTimer = setInterval(() => void check(current), POLL_INTERVAL_MS);
    } catch (createError) {
      if (current !== generation) return;
      state.value = "error";
      error.value = createError instanceof Error ? createError.message : String(createError);
    }
  }

  function reset() {
    generation += 1;
    stopTimers();
    state.value = "idle";
    khqr.value = null;
    image.value = null;
    error.value = null;
  }

  onScopeDispose(reset);

  return { state, khqr, image, error, secondsLeft, start, reset };
}
