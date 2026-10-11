import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? parseISO(v) : v;
  return isValid(d) ? d : null;
}

/** "7 Oct 2026, 12:59 pm" */
export function formatDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, "d MMM yyyy, h:mm aaa") : "";
}

/** "7 Oct 2026" */
export function formatDate(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, "d MMM yyyy") : "";
}

/** "12:59 pm" */
export function formatTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? format(d, "h:mm aaa") : "";
}

/** "3 min ago" */
export function formatAgo(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : "";
}

/** YYYY-MM-DD for query params */
export function isoDay(d: Date = new Date()): string {
  return format(d, "yyyy-MM-dd");
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

/** "08:32" elapsed for timers */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
