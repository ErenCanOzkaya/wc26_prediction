import { describe, it, expect } from "vitest";
import { scoreGame } from "./scoring";

describe("scoreGame", () => {
  it("awards full marks (= club count) for a first-move solve", () => {
    expect(scoreGame(8, 1, true)).toBe(8);
  });
  it("awards 1 point when solved on the last allowed move", () => {
    expect(scoreGame(8, 8, true)).toBe(1);
  });
  it("awards 0 when not solved", () => {
    expect(scoreGame(8, 3, false)).toBe(0);
  });
  it("never goes below 1 for a solve", () => {
    expect(scoreGame(3, 5, true)).toBe(1);
  });
});
