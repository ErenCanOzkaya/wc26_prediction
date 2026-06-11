// All displayed kickoff times use Turkey time (GMT+3). Fixing the timeZone keeps
// server and client output identical (no hydration mismatch) and matches the
// audience. The .ics export still carries the exact UTC instant.
const TZ = "Europe/Istanbul";

export const fmtDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: TZ,
});

export const fmtTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});

export const fmtDateTime = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});
