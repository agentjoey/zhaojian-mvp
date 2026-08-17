"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  computeFengshui, dwellingGua,
  type FengshuiChart, type Direction, type DirectionVerdict,
} from "@eamvp/core";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { listDwellings } from "@/lib/dwellings";
import { supabase } from "@/lib/supabase";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useT } from "@/lib/i18n/I18nProvider";
import { PageHeader } from "@/components/PageHeader";
import { ObjectAdvisorForm } from "../ObjectAdvisorForm";

const ENABLED = process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1";

/**
 * 物件顾问页（EP-fs-08 弱版 / EP-fs-18 强版）。与「境」主页面（../page.tsx）同一套
 * 骨架约定：flag 门控、档案读取（Telegram 会话优先，否则匿名档案）、加载/无档案态处理。
 * 落位建议本身（推荐方位/不宜方位/品类规则/与命主关系）由 ObjectAdvisorForm 内部调用
 * core 的 `adviseObject` 纯函数确定性算出，本页只负责准备入参并把它交下去。
 *
 * ── EP-fs-18：什么时候升级成强版 ─────────────────────────────────────────
 * 付费边界：**免费** = Layer 0 本命八方 + 弱版物件顾问；**会员** = 住宅实盘 / 分级
 * 化解 / 合看 / 多居所 + 强版物件顾问。
 *
 * ⚠️ 强版到底多给了什么，写清楚免得下一个人照着一句错话重新实现：这里曾写「推荐位
 * 需同时是命卦吉方与宅卦吉方」，**那是错的**。八宅里一个人的四吉方恰好就是他那一组
 * （东四/西四）的四个方位，因此「命卦吉方 ∩ 宅卦吉方」只可能是 4（命宅同组）或 0
 * （异组）——同组则与弱版逐字节相同，异组则 core 刻意退回命卦吉方（那些方位恰恰不是
 * 宅卦吉方）。所以**强版与弱版的 `recommendedDirections` 在任何输入下逐字节相同**
 * （评审枚举 276,480 组入参实测），强版唯一多出来的可观察内容是 `dwellingNote`
 * （只在异组时非 null）。详见 `../ObjectAdvisorForm.tsx` 的组件说明。
 *
 * 规则一句话：**已确认会员资格 且 确实有一个朝向已知的居所 → 强版；其余一切情形
 * → 弱版**（非会员 / 没登记居所 / 朝向选了「不确定」/ 居所读取失败 / 闸门探测失败 /
 * 探测尚在途）。
 *
 * ⚠️ 这里刻意**没有**照搬 ../page.tsx 那套 `probing/entitled/blocked/unknown` 四态
 * 付费墙状态机。那套东西存在是因为主页面上「被挡的用户要看见一堵付费墙」——把
 * 「不知道」误判成「不是会员」会把用户本来就看得见的内容换成推销，所以必须把
 * 「等待中」「探测失败」「确认非会员」三件事分得一清二楚。本页不是这个局面：
 * **弱版本身就是一份完整可用的产品**，不升级 = 保持波1 的既有行为，没有任何东西
 * 被拿走，因此不需要付费墙、也不需要为它区分「等待」与「确认否」。两个布尔量
 * （要不要叠加、探测是不是坏了）就够了。
 *
 * 唯一需要额外照顾的是：一个**确实是会员、确实有居所**的用户，若探测请求恰好失败，
 * 会静默拿到弱版建议而无从理解为什么。所以探测失败时（且确实存在 Layer 1 候选）
 * 给一行说明 + 「重新确认」入口——注意它与「服务端明确答了不是会员」是两件事，
 * 后者不显示这行说明（那会是与事实不符的解释）。
 */
export default function FengshuiObjectPage() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  /**
   * 只取第一个居所——与 ../page.tsx 一致（本波未实现居所切换器）。这里只留下
   * `facing`（一个原语），因为本页需要的全部信息就是「有没有一个朝向已知的居所、
   * 朝哪」；把整个 Dwelling 存进 state 会让下面几个 effect/memo 的依赖变成对象引用，
   * 每次重新拉取都触发一遍无谓的重新探测。
   */
  const [facing, setFacing] = useState<Direction | null>(null);
  /** 服务端**明确**放行。默认 false = 弱版；探测失败/未探测都停在 false。 */
  const [entitled, setEntitled] = useState(false);
  /** 探测本身坏了（网络异常 / 非 2xx / body 读不出布尔）——**不是**「判定为非会员」。 */
  const [probeFailed, setProbeFailed] = useState(false);
  /** 点一次「重新确认」就 +1，进入探测 effect 的依赖数组（同 ../page.tsx 的手法）。 */
  const [probeRetryNonce, setProbeRetryNonce] = useState(0);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  // 居所读取失败按「没有居所」处理：本页据此退回弱版，而弱版是完整可用的
  // ——不像 ../page.tsx 那样需要区分「读取失败」与「还没登记」（那边靠这个区分
  // 决定要不要引导用户去登记居所，误判会诱导重复登记；这里没有这个引导）。
  useEffect(() => {
    if (!ENABLED || !profile) return;
    let cancelled = false;
    listDwellings()
      .then((list) => { if (!cancelled) setFacing(list[0]?.facing ?? null); })
      .catch(() => { if (!cancelled) setFacing(null); });
    return () => { cancelled = true; };
  }, [profile]);

  // 会员闸门探测。`BILLING_ENABLED`（无 NEXT_PUBLIC_ 前缀）与会员状态都是服务端
  // 专属信息，客户端读不到，只能问服务端；与 /fengshui、/fengshui/dwellings 共用
  // 同一个 GET 端点与同一份服务端判断（isFengshuiEntitled），不另写一份规则。
  // 只在存在朝向已知的居所时才探测——没有 Layer 1 候选时探测结果不影响任何渲染，
  // 白发一次网络往返。
  //
  // 两个状态量都**只在探测落定时**写一次，effect 体内不做任何同步 setState（既避开
  // 级联渲染，也让 react-hooks/set-state-in-effect 干净）。不需要在开头把它们复位：
  // 下面两个读取点都与 `facing` 取与，没有 Layer 1 候选时它们的值读不到；重试期间
  // 保留上一次的失败提示直到新结果到手，也比先闪一下消失更稳。
  useEffect(() => {
    if (!facing) return;
    let cancelled = false;
    (async () => {
      try {
        // Authorization：TG 会话走 cookie（同源请求自动带上），本地匿名/邮箱登录靠
        // 这个头，服务端才能识别出「其实是会员」，不会被误挡成非会员。
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        const r = await fetch("/api/fengshui/reading", {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        // 非 2xx / body 读不出布尔值 = 基础设施失败（冷启动、代理插手、离线占位页），
        // **不是**「服务端判定你不是会员」——本路由的正常回答永远是 200 + { entitled }。
        // 两者都退回弱版，但只有前者给「暂时确认不了」的说明。
        if (!r.ok) {
          setEntitled(false);
          setProbeFailed(true);
          return;
        }
        const body = (await r.json().catch(() => null)) as { entitled?: boolean } | null;
        if (cancelled) return;
        if (typeof body?.entitled !== "boolean") {
          setEntitled(false);
          setProbeFailed(true);
          return;
        }
        setEntitled(body.entitled);
        setProbeFailed(false);
      } catch {
        if (cancelled) return;
        setEntitled(false);
        setProbeFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [facing, probeRetryNonce]);

  const fs: FengshuiChart | null = useMemo(
    () => (profile ? computeFengshui({ birth: profile.birthInput, chart: profile.chart }) : null),
    [profile],
  );

  /**
   * 宅卦八方。只在放行时才算——未放行的浏览器里根本不该存在这份会员派生数据
   * （Task 10 修复单 Important 2 立下的规矩：不是「算好但不渲染」，是压根不算）。
   *
   * 用 `dwellingGua(facing).sectors` 而不是把 dwelling 塞进 `computeFengshui`：本页
   * 要的只是宅八方这一样东西，走 Layer 1 命盘会一并算出宅层化解等其余会员内容，
   * 白算且平白把它们带进客户端 state。
   */
  const dwellingSectors: Record<Direction, DirectionVerdict> | undefined = useMemo(
    () => (entitled && facing ? dwellingGua(facing).sectors : undefined),
    [entitled, facing],
  );

  /** 有 Layer 1 候选、但资格没探出来——给个交代，别让会员莫名其妙拿到弱版。 */
  const showProbeFailedNote = !!facing && probeFailed;

  if (!ENABLED) return <Centered>{t("fengshui.notEnabled")}</Centered>;
  if (profile === undefined) return <Centered>{t("fengshui.loadingProfile")}</Centered>;
  if (profile === null) {
    return (
      <Centered>
        <p className="text-ink-2">{t("fengshui.noProfile")}</p>
        <Link href="/reading" className="mt-4 text-[14px]" style={{ color: "var(--color-cinnabar)" }}>
          {t("fengshui.goCast")}
        </Link>
      </Centered>
    );
  }

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <Link href="/fengshui" className="text-[13px] text-ink-2">← {t("fengshui.title")}</Link>
      <div className="mt-3">
        <PageHeader kicker="物 件" title={t("fengshui.object.title")} annotation={t("fengshui.object.subtitle")} />
      </div>
      {showProbeFailedNote && (
        <div className="mt-3">
          <p className="text-[13px] text-muted">{t("fengshui.object.dwellingUnknown")}</p>
          <button
            type="button"
            onClick={() => setProbeRetryNonce((n) => n + 1)}
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-cinnabar)" }}
          >
            {t("fengshui.retryEntitlement")}
          </button>
        </div>
      )}
      <div className="mt-6"><ObjectAdvisorForm fs={fs!} dwellingSectors={dwellingSectors} /></div>
      <p className="mt-8 text-[12px] text-muted">{t("fengshui.disclaimer")}</p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
