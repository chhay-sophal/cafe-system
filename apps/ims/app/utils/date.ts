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

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

// A "YYYY-MM-DD" day as a local Date at midnight.
export function parseDateLocal(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Whole days from `start` to `end` ("YYYY-MM-DD"); rounded, so a daylight
// saving change in between doesn't leave a fraction.
export function daysBetween(start: string, end: string): number {
  return Math.round((parseDateLocal(end).getTime() - parseDateLocal(start).getTime()) / 86_400_000);
}

// A calendar month, whole or - for the current month - so far.
function isMonthPeriod(startDate: string, endDate: string, today: string): boolean {
  const start = parseDateLocal(startDate);
  if (start.getDate() !== 1) {
    return false;
  }
  const monthEnd = formatDateLocal(endOfMonth(start));
  return endDate === monthEnd || (endDate === today && today.slice(0, 7) === startDate.slice(0, 7));
}

// The period just before (-1) or after (+1) the given one, as the picker's
// arrows step: a month steps by calendar month, anything else by its own
// length (a day by a day, a week by a week). Never runs past `today` - the
// end is pulled back to it - and null when there's nothing after.
export function shiftPeriod(
  startDate: string,
  endDate: string,
  direction: 1 | -1,
  today: string,
): { startDate: string; endDate: string } | null {
  if (isMonthPeriod(startDate, endDate, today)) {
    const start = parseDateLocal(startDate);
    const target = new Date(start.getFullYear(), start.getMonth() + direction, 1);
    const targetStart = formatDateLocal(target);
    if (targetStart > today) {
      return null;
    }
    const targetEnd = formatDateLocal(endOfMonth(target));
    return { startDate: targetStart, endDate: targetEnd > today ? today : targetEnd };
  }

  const length = daysBetween(startDate, endDate) + 1;
  const shift = (value: string) => formatDateLocal(addDays(parseDateLocal(value), length * direction));
  const nextStart = shift(startDate);
  if (nextStart > today) {
    return null;
  }
  const nextEnd = shift(endDate);
  if (nextEnd > today) {
    return { startDate: formatDateLocal(addDays(parseDateLocal(today), -(length - 1))), endDate: today };
  }
  return { startDate: nextStart, endDate: nextEnd };
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

// The month of a "YYYY-MM-DD" day, e.g. "October 2026" / "តុលា 2026".
export function formatMonthLabel(dateStr: string, locale: string): string {
  const date = parseDateLocal(dateStr);
  if (isKhmer(locale)) {
    return `${KHMER_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }
  return date.toLocaleDateString(locale, { month: "long", year: "numeric" });
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
