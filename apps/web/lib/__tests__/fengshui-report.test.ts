import { describe, it, expect } from "vitest";
import { fengshuiFingerprint } from "../fengshui-report";

const base = {
  profileId: "p1", locale: "zh", engineVersion: "fs-2",
  dwelling: { id: "d1", facing: "S", tenancy: "rent" as const, kind: "home" as const },
  memberProfileIds: ["p2", "p3"],
};

describe("EP-fs-16 报告指纹", () => {
  it("同输入同指纹（可缓存）", () => {
    expect(fengshuiFingerprint(base)).toBe(fengshuiFingerprint({ ...base }));
  });

  it("改朝向 → 指纹变（这是 localStorage 那套键做不到的）", () => {
    expect(fengshuiFingerprint({ ...base, dwelling: { ...base.dwelling, facing: "N" } }))
      .not.toBe(fengshuiFingerprint(base));
  });

  it("增减同住人 → 指纹变", () => {
    expect(fengshuiFingerprint({ ...base, memberProfileIds: ["p2"] })).not.toBe(fengshuiFingerprint(base));
  });

  it("同住人顺序不影响指纹（集合语义，避免无谓重生成）", () => {
    expect(fengshuiFingerprint({ ...base, memberProfileIds: ["p3", "p2"] })).toBe(fengshuiFingerprint(base));
  });

  it("切语言 / 换引擎版本 / 换档案 → 指纹变", () => {
    expect(fengshuiFingerprint({ ...base, locale: "en" })).not.toBe(fengshuiFingerprint(base));
    expect(fengshuiFingerprint({ ...base, engineVersion: "fs-3" })).not.toBe(fengshuiFingerprint(base));
    expect(fengshuiFingerprint({ ...base, profileId: "pX" })).not.toBe(fengshuiFingerprint(base));
  });

  it("Layer 0（无居所）也有稳定指纹", () => {
    const l0 = { ...base, dwelling: null, memberProfileIds: [] };
    expect(fengshuiFingerprint(l0)).toBe(fengshuiFingerprint({ ...l0 }));
    expect(fengshuiFingerprint(l0)).not.toBe(fengshuiFingerprint(base));
  });

  it("租售状态变化 → 指纹变（它会改变化解排序）", () => {
    expect(fengshuiFingerprint({ ...base, dwelling: { ...base.dwelling, tenancy: "own" } }))
      .not.toBe(fengshuiFingerprint(base));
  });
});
