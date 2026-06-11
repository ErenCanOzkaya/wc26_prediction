import { describe, test, expect } from "vitest";
import { buildIcs } from "./ics";

const STAMP = new Date("2026-06-01T00:00:00Z");

describe("buildIcs", () => {
  test("wraps a single event with the required calendar fields", () => {
    const ics = buildIcs(
      [
        {
          uid: "match-1@wc26",
          start: "2026-06-11T19:00:00Z",
          summary: "Mexico vs Canada",
          location: "Estadio Azteca",
        },
      ],
      STAMP,
    );
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:match-1@wc26");
    expect(ics).toContain("DTSTART:20260611T190000Z");
    expect(ics).toContain("DTEND:20260611T210000Z"); // default +2h
    expect(ics).toContain("SUMMARY:Mexico vs Canada");
    expect(ics).toContain("LOCATION:Estadio Azteca");
    expect(ics).toContain("TRIGGER:-PT30M"); // default 30-min reminder
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });

  test("escapes commas, semicolons and newlines (RFC 5545)", () => {
    const ics = buildIcs(
      [{ uid: "x", start: "2026-06-11T19:00:00Z", summary: "A, B; C\nD" }],
      STAMP,
    );
    expect(ics).toContain("SUMMARY:A\\, B\\; C\\nD");
  });

  test("honours custom duration and alarm", () => {
    const ics = buildIcs(
      [
        {
          uid: "x",
          start: "2026-06-11T19:00:00Z",
          summary: "Final",
          durationMinutes: 90,
          alarmMinutesBefore: 60,
        },
      ],
      STAMP,
    );
    expect(ics).toContain("DTEND:20260611T203000Z");
    expect(ics).toContain("TRIGGER:-PT60M");
  });

  test("emits one VEVENT per event", () => {
    const ics = buildIcs(
      [
        { uid: "a", start: "2026-06-11T19:00:00Z", summary: "One" },
        { uid: "b", start: "2026-06-12T19:00:00Z", summary: "Two" },
      ],
      STAMP,
    );
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2);
  });
});
