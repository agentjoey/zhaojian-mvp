import { describe, it, expect } from "vitest";
import { computeWesternChart, BirthInputSchema } from "../src/index";
import type { BirthInput } from "../src/index";

const input: BirthInput = BirthInputSchema.parse({
  date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47,
});

describe("EP-522 宫制可选（whole-sign 默认 / placidus 可选）", () => {
  it("默认 whole-sign", () => {
    expect(computeWesternChart(input)?.houseSystem).toBe("whole-sign");
  });
  it("placidus：宫制生效，行星落 1–12 宫", () => {
    const w = computeWesternChart(input, undefined, "placidus");
    expect(w?.houseSystem).toBe("placidus");
    expect(w?.planets.every((p) => p.house >= 1 && p.house <= 12)).toBe(true);
  });
});
