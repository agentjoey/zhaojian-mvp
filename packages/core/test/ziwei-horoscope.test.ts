import { describe, it, expect } from "vitest";
import { computeZiweiHoroscope, BirthInputSchema } from "../src/index";
import type { BirthInput } from "../src/index";

const input: BirthInput = BirthInputSchema.parse({
  date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47,
});

describe("EP-521 紫微大限/流年四化 computeZiweiHoroscope", () => {
  const h = computeZiweiHoroscope(input, "2026-06-22");

  it("流年干支 + 四化正确（丙午年，忌=廉贞）", () => {
    expect(h.yearly.stem).toBe("丙");
    expect(h.yearly.branch).toBe("午");
    expect(h.yearly.mutagens.忌).toBe("廉贞");
    expect(h.yearly.mutagens.禄).toBe("天同");
  });

  it("大限干支正确（壬辰限）", () => {
    expect(h.decadal.stem).toBe("壬");
    expect(h.decadal.branch).toBe("辰");
    expect(h.decadal.mutagens.禄).toBe("天梁");
  });
});
