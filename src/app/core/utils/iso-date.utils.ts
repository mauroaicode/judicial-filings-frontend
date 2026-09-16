export const ISO_DATE_MIN = '1900-01-01';
export const ISO_DATE_MAX = '2100-12-31';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizeIsoDate(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '-' || trimmed === '–' || trimmed === '---') {
    return null;
  }
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function isValidCalendarIsoDate(value: string): boolean {
  const match = value.match(ISO_DATE_PATTERN);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isIsoDateInAllowedRange(value: string | null | undefined): boolean {
  const iso = normalizeIsoDate(value);
  if (!iso || !isValidCalendarIsoDate(iso)) return false;
  return iso >= ISO_DATE_MIN && iso <= ISO_DATE_MAX;
}

export function textsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim() === (b ?? '').trim();
}
