import { describe, expect, it } from "vitest";
import { FORTUNE_IMAGES, matchFortuneImage, seasonOf } from "../fortune-images";

describe("seasonOf", () => {
  it("按立春起算的月份粗粒度分季", () => {
    expect(seasonOf("2026-02-01")).toBe("春");
    expect(seasonOf("2026-04-30")).toBe("春");
    expect(seasonOf("2026-05-01")).toBe("夏");
    expect(seasonOf("2026-07-31")).toBe("夏");
    expect(seasonOf("2026-08-01")).toBe("秋");
    expect(seasonOf("2026-10-31")).toBe("秋");
    expect(seasonOf("2026-11-01")).toBe("冬");
    expect(seasonOf("2026-01-15")).toBe("冬");
  });
});

describe("matchFortuneImage 季节维度", () => {
  it("情绪池内若有当季标签图，只从该子集轮选", () => {
    const winterDate = "2026-12-20"; // 冬
    const image = matchFortuneImage("官杀", winterDate);
    expect(image).not.toBeNull();
    const winterTaggedInMood = FORTUNE_IMAGES.filter(
      (i) => i.moods.includes("官杀") && i.seasons?.includes("冬"),
    );
    if (winterTaggedInMood.length > 0) {
      expect(winterTaggedInMood.map((i) => i.file)).toContain(image!.file);
    }
  });

  it("情绪池内无当季标签图时，回退整个情绪池（不报错、不返回 null）", () => {
    const image = matchFortuneImage("比和", "2026-06-15");
    expect(image).not.toBeNull();
    expect(image!.moods).toContain("比和");
  });
});
