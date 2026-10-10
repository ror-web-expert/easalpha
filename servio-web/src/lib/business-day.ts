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

// SPEC Business Hours: the sentence shown under the start and end fields.
export function windowSentence(start: string, end: string) {
  const nextDay = end <= start ? " the next day" : "";
  return `Business day runs ${start} to ${end}${nextDay}; an order at 1:00 am belongs to the previous day's report, so midnight never splits an operational period.`;
}
