import { describe, it, expect } from "vitest";
import { pickDailyPlayer, dateSeed } from "./daily";

describe("dateSeed", () => {
  it("is deterministic per ISO date and differs by day", () => {
    expect(dateSeed("2026-06-11")).toBe(dateSeed("2026-06-11"));
    expect(dateSeed("2026-06-11")).not.toBe(dateSeed("2026-06-12"));
  });
});

describe("pickDailyPlayer", () => {
  const eligible = [10, 20, 30, 40, 50];

  it("returns the same player for the same seed", () => {
    const a = pickDailyPlayer(dateSeed("2026-06-11"), eligible, []);
    const b = pickDailyPlayer(dateSeed("2026-06-11"), eligible, []);
    expect(a).toBe(b);
    expect(eligible).toContain(a);
  });

  it("never picks a recently used player when others remain", () => {
    const recent = [10, 20, 30, 40];
    expect(pickDailyPlayer(dateSeed("2026-06-11"), eligible, recent)).toBe(50);
  });

  it("falls back to the full pool when all are recent", () => {
    const got = pickDailyPlayer(dateSeed("2026-06-11"), eligible, eligible);
    expect(eligible).toContain(got);
  });

  it("throws when there are no eligible players", () => {
    expect(() => pickDailyPlayer(1, [], [])).toThrow();
  });
});
