export interface IcsEvent {
  uid: string;
  start: Date | string; // kickoff (UTC)
  summary: string;
  location?: string;
  description?: string;
  durationMinutes?: number; // default 120
  alarmMinutesBefore?: number; // default 30
}

/** ISO timestamp → iCalendar UTC basic format (YYYYMMDDTHHMMSSZ). */
function toIcsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape per RFC 5545 §3.3.11 (text values). */
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Build a valid .ics document from one or more events. */
export function buildIcs(events: IcsEvent[], now: Date = new Date()): string {
  const stamp = toIcsUtc(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//wc26-league//World Cup 2026//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const e of events) {
    const start = new Date(e.start);
    const end = new Date(start.getTime() + (e.durationMinutes ?? 120) * 60_000);
    const alarm = e.alarmMinutesBefore ?? 30;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsUtc(start)}`,
      `DTEND:${toIcsUtc(end)}`,
      `SUMMARY:${esc(e.summary)}`,
    );
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push(
      "BEGIN:VALARM",
      `TRIGGER:-PT${alarm}M`,
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(e.summary)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
