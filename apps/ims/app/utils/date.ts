// Local-date (not UTC) formatting throughout - toISOString() would shift the
// calendar day for any timezone behind/ahead of UTC at day boundaries.
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Display formatting follows the app's language (the i18n `locale`), not the
// browser's. Khmer is formatted here rather than by Intl: Chromium-based
// browsers (Chrome, Brave, Edge) don't all ship Khmer date data, and without
// it Intl silently falls back to English. Other languages use Intl.
const KHMER_MONTHS = [
  "មករា", "កុម្ភៈ", "មីនា", "មេសា", "ឧសភា", "មិថុនា",
  "កក្កដា", "សីហា", "កញ្ញា", "តុលា", "វិច្ឆិកា", "ធ្នូ",
];

function isKhmer(locale: string): boolean {
  return locale === "km" || locale.startsWith("km-");
}

// e.g. "1 វិច្ឆិកា 2026" - Khmer has no short month names.
function khmerDate(date: Date): string {
  return `${date.getDate()} ${KHMER_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// e.g. "1 វិច្ឆិកា 2026, 14:05"
function khmerDateTime(date: Date): string {
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${khmerDate(date)}, ${time}`;
}

// Backend timestamps are "YYYY-MM-DD HH:MM:SS".
function parseTimestamp(value: string): Date {
  return new Date(value.replace(" ", "T"));
}

// A "YYYY-MM-DD" day, e.g. "Nov 1, 2026" / "1 វិច្ឆិកា 2026".
export function formatDateLabel(dateStr: string, locale: string): string {
  const [year = 0, month = 1, day = 1] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (isKhmer(locale)) {
    return khmerDate(date);
  }
  return date.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
}

// A "YYYY-MM-DD" day without the year, for chart axes: "Nov 1" / "1 វិច្ឆិកា".
export function formatShortDate(dateStr: string, locale: string): string {
  const [year = 0, month = 1, day = 1] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (isKhmer(locale)) {
    return `${date.getDate()} ${KHMER_MONTHS[date.getMonth()]}`;
  }
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

// A backend timestamp as date and time.
export function formatDateTime(value: string, locale: string): string {
  const date = parseTimestamp(value);
  return isKhmer(locale) ? khmerDateTime(date) : date.toLocaleString(locale);
}

// A backend timestamp as a date only.
export function formatDate(value: string, locale: string): string {
  const date = parseTimestamp(value);
  return isKhmer(locale) ? khmerDate(date) : date.toLocaleDateString(locale);
}
