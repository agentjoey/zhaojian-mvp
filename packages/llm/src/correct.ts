import { MUTAGEN_STARS } from "./eval/vocab";

/**
 * 四化确定性后置纠正（EP-004c）。
 * 解读文本里出现「X化{禄/权/科/忌}」但与引擎生年四化不符时，
 * **删除错误的「化X」断言、保留星名**（只删不替——不注入新声明，不会造新错或切坏句）。
 * 引擎四化已验证 100% 正确（scripts/verify-sihua.ts），故以 birthMutagens 为准。
 *
 * 局限：只纠「星+化+类型」紧邻写法（与 eval 检测同源）；「生年化忌落X」等倒装不处理。
 */
const KINDS = ["禄", "权", "科", "忌"] as const;

export function correctMutagens(
  text: string,
  birthMutagens: Record<string, string>,
): { text: string; fixed: string[] } {
  const fixed: string[] = [];
  let out = text;
  for (const kind of KINDS) {
    for (const star of MUTAGEN_STARS) {
      if (birthMutagens[kind] === star) continue; // 正确配对，保留
      const wrong = `${star}化${kind}`;
      if (out.includes(wrong)) {
        out = out.split(wrong).join(star); // 删「化X」，留星名
        fixed.push(wrong);
      }
    }
  }
  return { text: out, fixed };
}
