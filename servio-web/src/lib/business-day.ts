import { isoDay } from "@/lib/dates";

/** Business day for a moment, given the branch day end time ("04:00"): before that time counts for the previous day. */
export function businessDayFor(dayEndTime: string | null | undefined, at: Date = new Date()): string {
  if (!dayEndTime) return isoDay(at);
  const [h, m] = dayEndTime.split(":").map(Number);
  const mins = at.getHours() * 60 + at.getMinutes();
  if (mins < h * 60 + (m || 0)) {
    const d = new Date(at);
    d.setDate(d.getDate() - 1);
    return isoDay(d);
  }
  return isoDay(at);
}
