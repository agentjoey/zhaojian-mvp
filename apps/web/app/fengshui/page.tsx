"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  computeFengshui, FENGSHUI_ENGINE_VERSION, directionsFor, DIRECTION_LABEL,
  type FengshuiChart, type DwellingInput, type CohabitantInput,
} from "@eamvp/core";
import { getActiveProfile, getProfile, type Profile } from "@/lib/profiles";
import { listDwellings, type Dwelling } from "@/lib/dwellings";
import { MAX_COHABITANTS } from "@/lib/fengshui-limits";
import { hasTgSession, isTelegram, tgGetProfile, tgListProfiles } from "@/lib/tg/client";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";
import { BaguaWheel } from "@/components/charts/BaguaWheel";
import { Markdown } from "@/components/Markdown";
import { Card } from "@/components/ui";
import { Group, Cell, Segmented } from "@/components/tg/native";
import { Paywall } from "@/components/Paywall";
import { supabase } from "@/lib/supabase";
import {
  fengshuiFingerprint, readFengshuiReport, requestFengshuiReading, saveFengshuiReport,
  type FengshuiSections,
} from "@/lib/fengshui-report";

const ENABLED = process.env.NEXT_PUBLIC_FENGSHUI_ENABLED === "1";
const SPIRIT_ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

/**
 * 「和 Mira 聊聊这条」链接携带的动作文本上限（最终评审 Blocking 2）。当前化解数据
 * （remedy.ts / env-psych.ts）里最长的 action 也就三四十字，80 是留了充足余量的
 * 保守上限——真正起作用的是防止未来新增更长文案时把 query string 无限拉长。
 */
const SPIRIT_QUERY_MAX_LEN = 80;

/** 供 /spirit 端拼出「关于这条化解的提问」的原始素材；超限截断，避免 URL 无限增长。 */
export function truncateForSpiritQuery(text: string, max = SPIRIT_QUERY_MAX_LEN): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 居所加载超时（复审必修2 次级风险）：见下方 withTimeout 的文档。 */
const DWELLINGS_TIMEOUT_MS = 8000;

/**
 * 把「可能永远不 resolve/reject 的 promise」转成「有限时间后必然 settle」。
 *
 * 背景：居所加载的 IIFE 原来只在 `listDwellings()` 外套了一层 `.catch(() => [])`——
 * 这只挡得住会 **reject** 的失败。真实网络里还有一种更差的失败模式：请求既不 resolve
 * 也不 reject（连接被静默挂起、代理超时不返回等）。这种情况下 `await` 会永远卡住，
 * `dwellingsError` 永远不会置位，narrative-fetch 的守卫也永远等不到 `dwellings`
 * 落定——用户界面上什么提示都不会出现，是比「显示一条错误」更差的静默挂起。
 * 用 `Promise.race` 兜底：超时后视为失败，纳入调用方统一的 catch 处理，
 * 保证用户在有限时间内至少能看到点什么（错误提示 + 重试入口）。
 * 导出供测试直接验证这个转换本身，不必也不该为了验证它去真的等
 * `DWELLINGS_TIMEOUT_MS` 那么久。
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`超时（${ms}ms）：请求未在预期时间内完成`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * 按 id 集合取同住人档案（EP-fs-tg）。TG 会话下匿名 Supabase 客户端没有会话、
 * RLS 下 `getProfile(id)` 逐条读只会拿到 null（合看在 TG 内因此静默失效）——
 * 改走 `tgListProfiles()` 中介一次拉全量再按 id 过滤。返回顺序跟随 `ids`
 * （居所上登记的成员顺序），与 TG 列表本身的排序无关。
 * 单个档案读不到（已删除/不属于本用户）时过滤掉，不连累整体——与原逐条
 * `getProfile(id).catch(() => null)` 的容错语义一致。
 */
async function loadProfilesByIds(ids: string[]): Promise<Profile[]> {
  if (ids.length === 0) return [];
  if (hasTgSession()) {
    const all = await tgListProfiles();
    const byId = new Map(all.map((p) => [p.id as string, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is Profile => p != null);
  }
  return (await Promise.all(ids.map((id) => getProfile(id).catch(() => null)))).filter(
    (p): p is Profile => p != null,
  );
}

/**
 * 会员闸门探测（Task 10，EP-fs-17，GET /api/fengshui/reading）要能让服务端识别当前
 * 用户。TG 会话走 cookie（同源请求自动带上，这里不用处理）；本地匿名 / 邮箱登录走
 * Authorization Bearer——与 account/page.tsx、SpiritPanel.tsx 同一手法（读 supabase
 * 会话的 access_token）。取不到会话（真正匿名、从未 ensureSession() 过）时返回空
 * header，服务端据此按「未登录」处理，等价于非会员——这本身就是正确结果，不需要
 * 特殊分支。生成叙述的 POST 请求的身份头在 `requestFengshuiReading`
 * （lib/fengshui-report.ts）内部处理，不经过这里。
 */
async function fengshuiAuthHeader(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * 叙述分节的标题键。**不要借用 directionsTitle / affinityTitle** ——
 * 那两个描述的是下方确定性区块（八方吉凶、宜用色与材），与叙述分节语义不同。
 * situation/youAndSpace 渲染在「盘」tab（与盘图同属「这是什么情况」）；
 * actions 分节沿用「可做的事」标题、渲染在「化解」tab，直接接在确定性化解清单
 * 的同一个标题下面（避免「可做的事」这个标题在页面上出现两次）。
 */
const SECTION_HEADING_KEY = {
  situation: "fengshui.narrativeSections.situation",
  youAndSpace: "fengshui.narrativeSections.youAndSpace",
} as const;

const TABS = ["chart", "remedy", "object"] as const;
type Tab = (typeof TABS)[number];

/**
 * 会员闸门探测的状态（Task 10 修复单 Critical 1）。
 *
 * ⚠️ 这里**必须**是三态以上，不能是 `boolean | undefined`：原实现把「探测失败」
 * （网络异常 / 冷启动 / 502 / 离线 / 广告拦截）直接 `setEntitled(false)`，于是
 * 「我们不知道」被当成了「确认没有权限」，页面把宅盘换成付费墙——而
 * `BILLING_ENABLED` 未设置（**默认配置**）时服务端对任何人都放行，这块内容本来
 * 就是这个用户一直看得见的。在计费根本没开的构建里，一次网络抖动就把用户已有的
 * 内容换成推销，是比"少显示一点"严重得多的错误。
 *
 * - `idle`      没有 Layer 1 候选（没有朝向已知的居所），无需探测
 * - `probing`   探测在途——UI 给加载态，**不给付费墙**（付费墙是终局判定，不是等待态）
 * - `entitled`  服务端明确放行
 * - `blocked`   服务端明确未放行（BILLING_ENABLED=1 且非会员）→ 这才是付费墙该出现的唯一情形
 * - `unknown`   探测失败，资格未知 → Layer 0 照常完整渲染，Layer 1 区块给「重新确认」入口
 */
type EntitlementState = "idle" | "probing" | "entitled" | "blocked" | "unknown";

/**
 * 「境」页（EP-fs-07 骨架 + Task 9/EP-fs-15 Tab 化）。骨架——命卦、八方盘、化解
 * 清单——全部确定性计算，与 LLM 无关、永远可得；叙述层由 LLM 生成，是唯一会
 * 失败/降级的部分。两档降级路径都不留白页，只在骨架旁边加一行可见提示 + 重试入口：
 *   1. failed  —— 请求本身失败（网络/超时/非 2xx）：没有叙述可显示。
 *   2. degraded —— 请求成功，但 generateFengshuiReading 判定模型说错过
 *      确定性事实（方位↔星名对不上），已被机械纠正。纠正只救得回星名，
 *      救不回建立在错方位上的整段叙述，所以不能把它当正常结果直接渲染
 *      （见 @eamvp/llm 的 FengshuiReading.degraded 文档）；也不写入缓存，
 *      避免一份带瑕疵的报告被永久复用。
 * degraded/failed 提示在「盘」「化解」两个 tab 各自独立渲染（`NarrativeStatus`）——
 * 二者共用同一份 sections/degraded/failed 状态，只是分别嵌在各自 tab 里，不是重复请求。
 *
 * Task 9（EP-fs-15）新增：
 *  - 有居所（`listDwellings()` 第一条，facing 非 null）时叠加 Layer 1——宅卦、宅八方、
 *    宅层化解、合看。facing 为 null（用户选「不确定」）时保持 Layer 0，只提示未设置。
 *  - 合看 chips：默认按主档案「我」的 `personalDirections` 给盘图着色；切到某位同住人
 *    时改用 `directionsFor(该人命卦)` 着色——这是八宅「同一套房对不同人不同」的直接
 *    体现，不是修辞。宅八方盘（`dwelling.sectors`）本身不随 viewAs 变化——它是房子
 *    自己的卦定的，与住的是谁无关；变的是「这个方位对当前选中的人是否吉」。
 */
export default function FengshuiPage() {
  const t = useT();
  const { locale } = useLocale();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [dwellings, setDwellings] = useState<Dwelling[] | undefined>(undefined);
  const [cohabitantProfiles, setCohabitantProfiles] = useState<Profile[] | undefined>(undefined);
  // 复审必修2：居所读取失败（区别于「读取成功、确认没有居所」）。UI 据此显示
  // 「读取失败 + 重试」而不是「还没登记居所」——两者对用户是完全不同的意思，
  // 把前者误判成后者会诱导用户重复登记一个其实已经存在的居所。
  const [dwellingsError, setDwellingsError] = useState(false);
  // 点一次「重试」就 +1，出现在下面居所加载 effect 的依赖数组里，复用与
  // narrative 的 retryNonce 相同的手法：不改变 profile 也能强制重新跑一遍。
  const [dwellingsRetryNonce, setDwellingsRetryNonce] = useState(0);
  const [tab, setTab] = useState<Tab>("chart");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // EP-fs-tg：TG 会话下 Tab 行换原生分段观感、化解清单换 Group+Cell；web 路径零变化。
  const inTg = mounted && isTelegram();
  const [viewAs, setViewAs] = useState<string>("main");
  const [sections, setSections] = useState<FengshuiSections | null>(null);
  const [failed, setFailed] = useState(false);
  const [degraded, setDegraded] = useState(false);
  // 点一次「重新生成叙述」就 +1，出现在下面 effect 的依赖数组里，用来在不改变
  // profile/fs/locale 的情况下强制重新跑一次那段异步逻辑，避免另写一份重复的
  // fetch 链路。服务端读取分支本身是安全的重放入口：failed/degraded 态下
  // readFengshuiReport 在上一次同一个 effect 里已经确认过是 cache miss
  // （命中的话根本不会走到 fetch、也就不会进入 failed/degraded），所以重跑时
  // 该分支自然还是 miss，会照常发起新请求，不需要额外清缓存。
  const [retryNonce, setRetryNonce] = useState(0);
  // 会员闸门（Task 10，EP-fs-17）：住宅实盘（宅八方）+ 多住客合看是会员功能。
  // 探测只在存在朝向已知的居所时才去问服务端（见下方 effect），避免给绝大多数
  // （尚无居所的）用户平白多一次网络往返。
  const [entitlement, setEntitlement] = useState<EntitlementState>("idle");
  // 点一次「重新确认」就 +1，出现在下方闸门探测 effect 的依赖数组里——与
  // retryNonce/dwellingsRetryNonce 同一手法，让探测失败可以被用户自己救回来。
  const [entitlementRetryNonce, setEntitlementRetryNonce] = useState(0);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  // 居所：**只取第一个**，`dwellings[1..]` 在整个代码库里没有任何读取方
  // （../fengshui/object/page.tsx 同样硬编码 `list[0]`）。本页没有居所切换器，
  // 会员与非会员在这里看到的都是 dwellings[0]。
  // 因此「多套居所」不构成会员权益：最终评审 I2 已撤除 dwellings/page.tsx 上那道
  // 挡住保存第 2 套的付费墙——升级换来的只是管理列表里多一行，别无他物。
  // 切换器是真功能、值得做，但需要连带补一条服务端写入路径（createDwelling 目前是
  // 浏览器直写 supabase），不在任何已交付 brief 的范围内，需要时另开任务。
  // 依赖 profile 而非并行加载，
  // 避免「profile 就绪但 dwellings 未就绪」这个中间态被误当成 Layer 0 触发一次多余的
  // LLM 请求（narrative-fetch effect 专门等两者都落定后才发起，见下）。
  // 两步（居所→合看成员）合在同一个 effect/同一条 promise 链里，两个 setState 在
  // 同一个微任务回调内先后调用，React 会把它们批处理进同一次渲染——比拆成两个各自
  // 独立触发的 effect 少两次中间渲染/生效周期。单个同住人档案加载失败（如已被删除）
  // 不连累整体——过滤掉即可。
  //
  // 复审必修2：整个 IIFE 套一层 try/catch（而不是只在 listDwellings() 后面挂
  // `.catch(() => [])`）——任何一步（含 listDwellings 本身、后续的同住人档案加载）
  // 出错都要落到同一条「读取失败」路径，而不是让异常静默变成 unhandled rejection、
  // dwellings 永远停在 undefined、narrative-fetch 的守卫永远等不到它落定。
  // withTimeout 兜底更极端的失败模式——请求既不 resolve 也不 reject——保证用户
  // 在有限时间内总能看到错误提示 + 重试入口，而不是无限期的空白/加载态。
  useEffect(() => {
    if (!ENABLED || !profile) return;
    let cancelled = false;
    (async () => {
      try {
        const { list, members } = await withTimeout(
          (async () => {
            const l = await listDwellings();
            const d = l[0];
            // 截断到 MAX_COHABITANTS（最终评审 I1）：服务端 `.max(MAX_COHABITANTS)` 是
            // 硬校验，超限的请求整个 400 → 「叙述暂时生成不出来」+ 一个永远不可能成功的
            // 重试按钮。选择器现在挡住了新的超限保存，但**已经存下来的**居所（上限存在
            // 之前存的）不截断就永久卡死，用户也无从把失败与同住人列表联系起来。
            // 在这一处截断而不是在下面拼 POST body 时截断：`cohabitantInputs`（本地
            // 确定性 computeFengshui / 指纹）与叙述请求体都从 cohabitantProfiles 派生，
            // 只截其中一头会让页面上的合看与服务端拿到的那份对不上。
            const ids = d?.facing ? d.memberProfileIds.slice(0, MAX_COHABITANTS) : [];
            const m = await loadProfilesByIds(ids);
            return { list: l, members: m };
          })(),
          DWELLINGS_TIMEOUT_MS,
        );
        if (cancelled) return;
        setDwellingsError(false);
        setDwellings(list);
        setCohabitantProfiles(members);
      } catch (e) {
        // ⚠️ 不能静默：把一次 Supabase 抖动（或纯粹的网络挂起）当成「用户还没登记
        // 居所」会把已有居所说成不存在，诱导重复登记。留痕 + 显式失败态 + 重试入口
        // （而不是复用 noDwelling 文案）；仍落定 dwellings/cohabitantProfiles 为
        // 空数组，让页面按 Layer 0 继续可用（不因为居所读取失败连累整个「境」页）。
        console.warn("[fengshui] 居所读取失败，按未登记处理并提示重试", e);
        if (cancelled) return;
        setDwellingsError(true);
        setDwellings([]);
        setCohabitantProfiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, dwellingsRetryNonce]);

  const dwelling = dwellings?.[0] ?? null;

  // Layer 1 入参：facing 为 null（不确定）时不传 dwelling，调用方（computeFengshui）
  // 据此走 Layer 0——「不确定就不猜」，见 packages/core/src/fengshui/dwelling.ts。
  const dwellingInput: DwellingInput | undefined = useMemo(() => {
    if (!dwelling || !dwelling.facing) return undefined;
    return { id: dwelling.id, name: dwelling.name, kind: dwelling.kind, tenancy: dwelling.tenancy, facing: dwelling.facing };
  }, [dwelling]);

  const cohabitantInputs: CohabitantInput[] | undefined = useMemo(() => {
    if (!dwellingInput) return undefined;
    return (cohabitantProfiles ?? []).map((p) => ({
      profileId: p.id, name: p.nickname, birth: p.birthInput, chart: p.chart,
    }));
  }, [dwellingInput, cohabitantProfiles]);

  // 会员闸门探测（Task 10，EP-fs-17）。BILLING_ENABLED（无 NEXT_PUBLIC_ 前缀）与
  // 会员状态（查询需要 service-role key）都是服务端专属信息，客户端读不到，只能
  // 问服务端——GET /api/fengshui/reading 与下面叙述 POST 共用同一份服务端闸门判断
  // （isFengshuiEntitled），不重复实现一份规则。只在存在朝向已知的居所
  // （dwellingInput 非空，即 Layer 1 候选）时才探测——没有居所可看时，探测结果不
  // 影响任何 UI，没必要多发一次请求。
  useEffect(() => {
    if (!dwellingInput) {
      setEntitlement("idle");
      return;
    }
    let cancelled = false;
    // 同步置 probing：让「有 Layer 1 候选、但还没有答案」这个状态显式可判别，
    // 渲染层据此给加载态而不是付费墙（修复单 Critical 1 第 1 条）。
    setEntitlement("probing");
    (async () => {
      try {
        const headers = await fengshuiAuthHeader();
        const r = await fetch("/api/fengshui/reading", { method: "GET", headers });
        if (cancelled) return;
        // ⚠️ 非 2xx（冷启动 / 502 / 代理插手）是**基础设施失败**，不是"服务端判定
        // 你不是会员"——本路由的正常回答永远是 200 + { entitled }。把它当成
        // blocked 就是把"不知道"说成"没有权限"（修复单 Critical 1 第 2 条）。
        if (!r.ok) {
          setEntitlement("unknown");
          return;
        }
        const data = (await r.json().catch(() => null)) as { entitled?: boolean } | null;
        if (cancelled) return;
        // 同理：200 但 body 读不出布尔值，说明拿到的不是这个端点的正常应答
        // （广告拦截器/离线页面的占位响应等），仍属"未知"，不能 Boolean() 成 false。
        if (typeof data?.entitled !== "boolean") {
          setEntitlement("unknown");
          return;
        }
        setEntitlement(data.entitled ? "entitled" : "blocked");
      } catch {
        // 探测本身失败（网络异常等）：资格未知。服务端（POST 侧）仍是最终防线，
        // 客户端这里既不放行付费内容，也不把付费墙推给一个可能本来就有权限的用户。
        if (!cancelled) setEntitlement("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dwellingInput, entitlementRetryNonce]);

  /** 服务端明确放行——**只有**这一种情况才计算/渲染 Layer 1 内容。 */
  const entitled = entitlement === "entitled";
  /** 探测尚未落定（含"还没开始探"）：给加载态，绝不给付费墙。 */
  const entitlementPending = entitlement === "idle" || entitlement === "probing";
  /** 探测失败、资格未知：给「重新确认」入口，同样绝不给付费墙。 */
  const entitlementUnknown = entitlement === "unknown";

  // 叙述生成与其缓存指纹要用「有效」居所——未放行时视同没有居所，换来的是一份
  // Layer 0 叙述（个人层，仍然免费），而不是让服务端直接 402、连累整段叙述
  // （包括本该免费的个人层部分）都拿不到。一旦 entitled 变成 true（比如升级为会员
  // 或探测重试成功），effectiveDwellingInput 随之变化，指纹也跟着变，自然触发重新
  // 生成 Layer 1 叙述——不需要额外的缓存失效逻辑。
  const effectiveDwellingInput = entitled ? dwellingInput : undefined;
  const effectiveCohabitantInputs = entitled ? cohabitantInputs : undefined;

  // 确定性派生：与 LLM 无关，永远可得。
  //
  // ⚠️ 用 **effective**（受闸门影响）而非原始 dwellingInput（修复单 Important 2）：
  // 原实现刻意用原始入参算 fs，好让 `f.layer` 如实反映"是否真的登记了居所"、
  // 从而区分两种 UI——但代价是 `f.dwelling.sectors`、`f.dwelling.matchWithPerson`
  // 与全部宅层化解都实实在在活在非会员的浏览器 state 里，只是没渲染出来。
  // 区分 UI 这个诉求不需要持有算好的 Layer 1 命盘：改用下面的
  // hasDwellingChart/hasBlockedDwelling 布尔量即可，同样的 UX，客户端不再持有
  // 任何付费内容。`f.layer === 1` 现在等价于"已确认放行且确实有居所"。
  //
  // 与 Critical 1 的组合：entitlement 为 probing/unknown 时 effectiveDwellingInput
  // 退化成 undefined → fs 是 Layer 0 → Layer 0 内容照常完整渲染，Layer 1 区块走
  // 加载/重试态（见下方 JSX）。
  const fs: FengshuiChart | null = useMemo(
    () =>
      profile
        ? computeFengshui({
            birth: profile.birthInput, chart: profile.chart,
            dwelling: effectiveDwellingInput, cohabitants: effectiveCohabitantInputs,
          })
        : null,
    [profile, effectiveDwellingInput, effectiveCohabitantInputs],
  );

  useEffect(() => {
    // dwellings/cohabitantProfiles 未落定前不发起请求——否则「profile 就绪但居所还在
    // 加载」这个瞬间会先按 Layer 0 请求一次，居所到手后 fs 变成 Layer 1 又请求第二次。
    if (!profile || !fs || dwellings === undefined || cohabitantProfiles === undefined) return;
    // 会员闸门（Task 10）：同一个道理——有居所时必须等闸门探测**落定**才能发起
    // 叙述请求，否则会在探测在途的瞬间先按 Layer 0 发一次，探测落定后
    // effectiveDwellingInput 变化又触发第二次，重演上面注释里「Layer 0 先请求
    // 一次、居所到手再请求一次」的双倍 LLM 账单问题。
    // 「落定」含探测失败（unknown）——那时资格未知、按 Layer 0 生成叙述，免费层的
    // 叙述不该因为一次探测失败就一并消失。
    if (dwellingInput && entitlementPending) return;
    // 竞态保护：locale 切换 / 点击重试都会让本 effect 重新跑一遍，可能与上一次
    // 尚未落定的异步链路同时在途。用 `cancelled` 标志确保只有「最新一次」的
    // then/catch 真正写状态，旧的一律作废——否则旧响应可能在新响应之后才落定，
    // 反而把新结果覆盖回旧内容。
    let cancelled = false;
    // 状态重置：修复「命中缓存分支直接 return、.catch 也不清 degraded/failed」的
    // 陈旧状态残留 bug——上一次（比如切 locale 前）若以 degraded/failed 收尾，
    // 这次 effect 重跑必须先清掉，否则新的可信内容会被上一次遗留的提示挡住。
    setFailed(false);
    setDegraded(false);
    setSections(null);

    // Task 7/9（EP-fs-16）：报告按指纹持久化到服务端 fengshui_reports。指纹带上
    // 居所关键字段与 memberProfileIds，改朝向/增减同住人都会让旧报告失效——
    // 未形成 Layer 1（facing 未定或无居所）时统一按 Layer 0 算指纹，与波1 等价。
    // Task 10：这里用 effectiveDwellingInput（而非原始 dwellingInput）——非会员时
    // 指纹必须与「实际生成的是 Layer 0 叙述」这件事一致，否则一旦日后升级为会员，
    // 相同指纹会命中一份不含宅层内容的旧缓存，看不到本该有的 Layer 1 叙述。
    const fp = fengshuiFingerprint({
      profileId: profile.id, locale, engineVersion: FENGSHUI_ENGINE_VERSION,
      dwelling: effectiveDwellingInput
        ? { id: effectiveDwellingInput.id, facing: effectiveDwellingInput.facing, tenancy: effectiveDwellingInput.tenancy, kind: effectiveDwellingInput.kind }
        : null,
      // 同样截断到 MAX_COHABITANTS：指纹必须与「这次实际生成的是哪一份叙述」一致，
      // 而实际喂给服务端的同住人已经在上面被截断了（最终评审 I1）。
      memberProfileIds: effectiveDwellingInput
        ? (dwelling?.memberProfileIds ?? []).slice(0, MAX_COHABITANTS)
        : [],
    });

    (async () => {
      // 服务端读取失败（未登录/网络）按 cache miss 处理，不阻断下面的重新生成。
      // ⚠️ 但**不能静默**：这已不是波1 那个客户端缓存，而是服务端持久化路径。
      // Supabase 若持续故障，表现是「每次加载都重新调一次 LLM」——花着钱、用户无感、
      // 我们也无从察觉。降级照旧，但必须留下可排查的痕迹。
      const cached = await readFengshuiReport(fp).catch((e) => {
        console.warn("[fengshui] 报告读取失败，按未命中处理（将重新生成）", e);
        return null;
      });
      if (cancelled) return;
      if (cached) { setSections(cached); return; }

      try {
        // Task 10（EP-fs-17）：dwelling/cohabitants 只在 entitled 时携带——服务端
        // 收到这两个字段会独立校验会员资格（客户端闸门可绕过，这不是唯一防线，
        // 只是不希望非会员平白把这次本该成功的 Layer 0 叙述请求打成 402）。
        // EP-fs-tg：请求经 `requestFengshuiReading` 分流——TG 会话打 /api/tg/fengshui
        // 中介（同一契约同一闸门），否则打 /api/fengshui/reading 并附带 Authorization
        // （本地匿名/邮箱登录靠它让服务端识别会员；TG 会话走 cookie，见该函数注释）。
        const data = await requestFengshuiReading(
          {
            ...profile.birthInput,
            dwelling: effectiveDwellingInput,
            cohabitants: effectiveCohabitantInputs
              ? (cohabitantProfiles ?? []).map((p) => ({
                  profileId: p.id, name: p.nickname, birth: p.birthInput,
                }))
              : [],
          },
          locale,
        );
        if (cancelled) return;
        setSections(data.sections);
        setDegraded(data.degraded);
        // 不可信叙述不落盘，避免一份带瑕疵的报告被永久复用（沿用波1的约束）。
        // 持久化失败不影响本次已展示的结果（state 上面已更新），所以不改 UI；
        // 但同样要留痕——写不进去意味着下次加载还得再花一次 LLM 钱。
        if (!data.degraded) {
          await saveFengshuiReport({
            fingerprint: fp, profileId: profile.id, dwellingId: effectiveDwellingInput?.id ?? null,
            layer: effectiveDwellingInput ? 1 : 0, locale, sections: data.sections,
          }).catch((e) => console.warn("[fengshui] 报告持久化失败，下次加载会重新生成", e));
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => { cancelled = true; };
    // entitlementPending 入依赖数组：探测落定/发生变化都要重新评估要不要重新生成
    // 叙述（effectiveDwellingInput/effectiveCohabitantInputs 由 entitled 派生，
    // 而 fs 又由它们派生——fs 已在数组里，这里显式带上守卫本身用到的那个量）。
  }, [profile, fs, dwelling, dwellingInput, cohabitantProfiles, dwellings, locale, retryNonce, entitlementPending]);

  function regenerate() {
    setRetryNonce((n) => n + 1);
  }

  function retryDwellings() {
    setDwellingsRetryNonce((n) => n + 1);
  }

  function retryEntitlement() {
    setEntitlementRetryNonce((n) => n + 1);
  }

  if (!ENABLED) return <Centered>{t("fengshui.notEnabled")}</Centered>;
  if (profile === undefined) return <Centered>{t("fengshui.loadingProfile")}</Centered>;
  if (profile === null) {
    return (
      <Centered>
        <p className="text-ink-2">{t("fengshui.noProfile")}</p>
        <Link href="/reading" className="mt-4 inline-block px-6 py-3 text-on-ink"
          style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}>
          {t("fengshui.goCast")}
        </Link>
      </Centered>
    );
  }

  const f = fs!;
  // 会员闸门（Task 10）：合看（切视角对照）是会员功能。`f.layer === 1` 现在已经
  // **蕴含**「已确认放行」（fs 由 effectiveDwellingInput 算出，见上方注释），
  // 所以这里不必也不该再判一次 entitled——未放行时 f 根本就是 Layer 0，
  // activeCohabitant 恒为 undefined，chips/对照说明自然回落到「只看自己」。
  const activeCohabitant = f.layer === 1 ? f.cohabitants.find((c) => c.profileId === viewAs) : undefined;
  const activeMingGua = activeCohabitant?.mingGua ?? f.mingGua;
  const activeVerdicts = activeCohabitant ? directionsFor(activeCohabitant.mingGua.guaName) : f.personalDirections;
  const hasCohabitants = f.layer === 1 && f.cohabitants.length > 0;
  // 化解 tab 同理：宅层分级化解属会员功能，而 f.remedies 在未放行时本来就只含
  // 个人层（fs 是 Layer 0）——不再需要单独算一份 personalOnlyRemedies 兜底。

  // 是否真的登记了朝向已知的居所（**与会员状态无关**）。UI 靠它区分三种对用户
  // 完全不同的情形，而不再靠"手里有没有算好的 Layer 1 命盘"（修复单 Important 2）。
  const hasDwellingChart = !!dwellingInput;
  /** 有居所、且服务端**明确**判定未放行 —— 这是整页唯一该出现付费墙的情形。 */
  const hasBlockedDwelling = hasDwellingChart && entitlement === "blocked";
  /** 有居所、但资格未知（探测失败）—— 给「重新确认」，绝不给付费墙。 */
  const hasUnknownDwelling = hasDwellingChart && entitlementUnknown;

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <h1 className="text-[24px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.title")}</h1>
      <p className="mt-1 text-[13px] text-muted">{t("fengshui.subtitle")}</p>

      {inTg ? (
        <div className="mt-5">
          <Segmented
            options={TABS.map((tb) => ({ value: tb, label: t(`fengshui.tabs.${tb}`) }))}
            value={tab}
            onChange={setTab}
            idBase="fs"
            ariaLabel={t("fengshui.title")}
          />
        </div>
      ) : (
        <div className="mt-5 flex gap-1 border-b" style={{ borderColor: "var(--color-line)" }}>
          {TABS.map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              className="px-3 py-2 text-[14px]"
              style={{
                color: tab === tb ? "var(--color-cinnabar)" : "var(--color-ink-2)",
                borderBottom: tab === tb ? "2px solid var(--color-cinnabar)" : "2px solid transparent",
              }}
            >
              {t(`fengshui.tabs.${tb}`)}
            </button>
          ))}
        </div>
      )}

      {tab === "chart" && (
        <div role="tabpanel" id="fs-panel-chart" aria-labelledby="fs-tab-chart">
          <NarrativeStatus
            t={t}
            sections={sections}
            degraded={degraded}
            failed={failed}
            onRetry={regenerate}
            render={(s) => (
              <>
                <div>
                  <h2 className="text-[18px]" style={{ fontFamily: "var(--font-serif)" }}>
                    {t(SECTION_HEADING_KEY.situation)}
                  </h2>
                  <div className="reading-prose mt-2"><Markdown text={s.situation} /></div>
                </div>
                <div>
                  <h2 className="text-[18px]" style={{ fontFamily: "var(--font-serif)" }}>
                    {t(SECTION_HEADING_KEY.youAndSpace)}
                  </h2>
                  <div className="reading-prose mt-2"><Markdown text={s.youAndSpace} /></div>
                </div>
              </>
            )}
          />

          <section className="mt-8">
            <h2 className="text-[18px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.personalTitle")}</h2>

            {hasCohabitants && f.layer === 1 && (
              <div className="mt-2">
                <p className="text-[12px] text-muted">{t("fengshui.viewAs")}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <ViewAsChip active={viewAs === "main"} onClick={() => setViewAs("main")}>
                    {t("fengshui.viewAsSelf")}
                  </ViewAsChip>
                  {f.cohabitants.map((c) => (
                    <ViewAsChip key={c.profileId} active={viewAs === c.profileId} onClick={() => setViewAs(c.profileId)}>
                      {c.name}
                    </ViewAsChip>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col items-center">
              <BaguaWheel verdicts={activeVerdicts} centerLabel={`${activeMingGua.guaName}${activeMingGua.gua}`} />
              <p className="mt-2 text-[13px] text-ink-2">
                {t("fengshui.mingGua")}：{activeMingGua.guaName}{activeMingGua.gua}（{activeMingGua.group}）
              </p>
            </div>

            {activeCohabitant && (activeCohabitant.sharedGood.length > 0 || activeCohabitant.conflicts.length > 0) && (
              <div className="mt-3 p-3" style={{ borderRadius: "var(--radius-card)", background: "var(--color-tint)" }}>
                <h3 className="text-[13px] text-ink">{t("fengshui.cohabitantsTitle")}</h3>
                {activeCohabitant.sharedGood.length > 0 && (
                  <p className="mt-1 text-[13px] text-ink-2">
                    {t("fengshui.sharedGoodNote", {
                      name: activeCohabitant.name,
                      directions: activeCohabitant.sharedGood.map((d) => DIRECTION_LABEL[d]).join(t("common.listSeparator")),
                    })}
                  </p>
                )}
                {activeCohabitant.conflicts.length > 0 && (
                  <p className="mt-1 text-[13px] text-ink-2">
                    {t("fengshui.conflictsNote", {
                      name: activeCohabitant.name,
                      directions: activeCohabitant.conflicts.map((d) => DIRECTION_LABEL[d]).join(t("common.listSeparator")),
                    })}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* 住宅实盘（宅八方）区块。四种状态各自有对应渲染，**不共用**兜底分支——
              「探测中」「探测失败」与「确认非会员」是三件不同的事，前两者给付费墙
              等于在向可能已经拥有该内容的用户推销（修复单 Critical 1）。 */}
          {hasDwellingChart && (
            f.layer === 1 ? (
              <section className="mt-8 flex flex-col items-center">
                <h2 className="self-start text-[18px]" style={{ fontFamily: "var(--font-serif)" }}>
                  {t("fengshui.dwellingTitle")}
                </h2>
                <div className="mt-4 flex flex-col items-center">
                  <BaguaWheel verdicts={f.dwelling.sectors} centerLabel={`${f.dwelling.guaName}宅`} ariaLabel="房屋八方吉凶盘" />
                  <p className="mt-2 text-[13px] text-ink-2">
                    {f.dwelling.name} · {f.dwelling.guaName}宅（{f.dwelling.group}）
                  </p>
                  {/* 复审必修3：同屏已并排显示「本命卦（东/西四命）」与「宅卦（东/西四命）」
                      两个标签，此前从不说这俩合不合——而 core 的 buildDwellingRemedies 早已
                      在用这个判语生成宅层化解。措辞非决定论：「相冲」≠「这房子不能住」。 */}
                  <p className="mt-1 text-[13px] text-ink-2">
                    {t(`fengshui.matchNote.${f.dwelling.matchWithPerson}`)}
                  </p>
                </div>
              </section>
            ) : hasBlockedDwelling ? (
              // 会员闸门（Task 10，EP-fs-17）：有居所、且服务端**明确**判定未放行——
              // 住宅实盘（宅八方）与合看都是会员功能，整块换成 Paywall，而不是悄悄
              // 隐藏（用户能看见「有东西在这里，需要会员才能看」，而不是以为自己压根
              // 没登记居所——那会误导去 /fengshui/dwellings 重复登记）。
              // reason="member"：这里没有"上限"、也没有要"保存"的东西（修复单 Important 5）。
              <section className="mt-8">
                <Paywall reason="member" />
              </section>
            ) : hasUnknownDwelling ? (
              // 探测失败：资格未知。给出「不代表你没有权限」的说明 + 重新确认入口，
              // 而不是把付费墙推给一个多半本来就看得到这块内容的用户
              // （BILLING_ENABLED 未设置时服务端对任何人都放行，那是默认配置）。
              <section className="mt-8">
                <p className="text-[13px] text-muted">{t("fengshui.entitlementUnknown")}</p>
                <button
                  type="button"
                  onClick={retryEntitlement}
                  className="mt-2 text-[13px]"
                  style={{ color: "var(--color-cinnabar)" }}
                >
                  {t("fengshui.retryEntitlement")}
                </button>
              </section>
            ) : (
              // 探测在途：加载态。姊妹页 dwellings/page.tsx 早就是这个做法。
              <section className="mt-8">
                <p className="text-[13px] text-muted">{t("common.loading")}</p>
              </section>
            )
          )}

          {/* 「还没登记居所 / 朝向未确定 / 读取失败」三条引导语。判据是**有没有登记
              朝向已知的居所**（hasDwellingChart），不是 f.layer——f.layer 现在受
              会员状态影响，用它会让「有宅但被挡」的用户读到「这个居所的朝向未确定」
              这种与事实不符的提示。 */}
          {!hasDwellingChart && dwellings !== undefined && (
            <section className="mt-8">
              {dwellingsError ? (
                <div>
                  <p className="text-[13px] text-muted">{t("fengshui.dwellingsError")}</p>
                  <button
                    type="button"
                    onClick={retryDwellings}
                    className="mt-2 text-[13px]"
                    style={{ color: "var(--color-cinnabar)" }}
                  >
                    {t("fengshui.retryDwellings")}
                  </button>
                </div>
              ) : dwelling ? (
                <p className="text-[13px] text-muted">{t("fengshui.facingUnknownNote")}</p>
              ) : (
                <div>
                  <p className="text-[13px] text-muted">{t("fengshui.noDwelling")}</p>
                  <Link href="/fengshui/dwellings" className="mt-2 inline-block text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
                    {t("fengshui.addDwelling")}
                  </Link>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {tab === "remedy" && (
        <section className="mt-6" role="tabpanel" id="fs-panel-remedy" aria-labelledby="fs-tab-remedy">
          <h2 className="text-[18px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.remedyTitle")}</h2>
          <NarrativeStatus
            t={t}
            sections={sections}
            degraded={degraded}
            failed={failed}
            onRetry={regenerate}
            render={(s) => <div className="reading-prose mt-2"><Markdown text={s.actions} /></div>}
          />
          {inTg ? (
            // TG：化解清单用原生 Group+Cell。诚实标注（传统象征 vs 传统+现代）与
            // 成本分级一并保留在副标题——它们是产品可信度的核心，不能在原生化的
            // 名义下丢掉。
            <div className="mt-3">
            <Group>
              {f.remedies.map((r) => (
                <Cell
                  key={r.id}
                  icon={t(`fengshui.effortLabel.${r.effort}`).slice(0, 1)}
                  title={r.action}
                  subtitle={
                    <span className="flex flex-col gap-1 pt-0.5">
                      <span>
                        {t(`fengshui.effortLabel.${r.effort}`)} ·{" "}
                        {r.evidence === "传统象征" ? t("fengshui.evidenceSymbolic") : t("fengshui.evidenceBoth")}
                      </span>
                      <span>{t("fengshui.traditionalLabel")}：{r.traditional}</span>
                      {r.modern && <span>{t("fengshui.modernLabel")}：{r.modern}</span>}
                      {SPIRIT_ENABLED && (
                        <Link
                          href={`/spirit?topic=fengshui&q=${encodeURIComponent(truncateForSpiritQuery(r.action))}`}
                          className="inline-block"
                          style={{ color: "var(--color-cinnabar)" }}
                        >
                          {t("fengshui.askMira")}
                        </Link>
                      )}
                    </span>
                  }
                />
              ))}
            </Group>
            </div>
          ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {f.remedies.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center gap-2 text-[12px] text-muted">
                  <span>{t(`fengshui.effortLabel.${r.effort}`)}</span>
                  <span>·</span>
                  <span>{r.evidence === "传统象征" ? t("fengshui.evidenceSymbolic") : t("fengshui.evidenceBoth")}</span>
                </div>
                <p className="mt-1.5 text-[15px] text-ink">{r.action}</p>
                <p className="mt-2 text-[13px] text-ink-2">{t("fengshui.traditionalLabel")}：{r.traditional}</p>
                {r.modern && (
                  <p className="mt-1 text-[13px] text-ink-2">{t("fengshui.modernLabel")}：{r.modern}</p>
                )}
                {SPIRIT_ENABLED && (
                  <Link
                    href={`/spirit?topic=fengshui&q=${encodeURIComponent(truncateForSpiritQuery(r.action))}`}
                    className="mt-3 inline-block text-[13px]"
                    style={{ color: "var(--color-cinnabar)" }}
                  >
                    {t("fengshui.askMira")}
                  </Link>
                )}
              </Card>
            ))}
          </ul>
          )}
        </section>
      )}

      {tab === "object" && (
        <section className="mt-6" role="tabpanel" id="fs-panel-object" aria-labelledby="fs-tab-object">
          <Card className="p-5">
            <h2 className="text-[16px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.object.title")}</h2>
            <p className="mt-1 text-[13px] text-ink-2">{t("fengshui.object.subtitle")}</p>
            <Link
              href="/fengshui/object"
              className="mt-4 inline-block px-5 py-2.5 text-on-ink text-[14px]"
              style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}
            >
              {t("fengshui.object.submit")}
            </Link>
          </Card>
        </section>
      )}

      <p className="mt-8 text-[12px] text-muted">{t("fengshui.disclaimer")}</p>
    </main>
  );
}

/**
 * 叙述状态渲染（EP-fs-15 提炼）：未降级且已拿到 sections 时调用 `render(sections)`
 * （调用方负责用 sections 拼具体内容）；degraded/failed 时显示对应提示 + 重试入口。
 * 「盘」「化解」两个 tab 各自套一层，用的是同一份 sections/degraded/failed 状态——
 * 不是两次独立请求，只是同一份结果在两处分别渲染其中一部分。
 *
 * ⚠️ `render` 必须是函数（而非直接传 JSX children）：children 若直接写
 * `<Markdown text={sections!.actions} />`，`sections!.actions` 会在**父组件渲染时**
 * 就立即求值（JSX children 是普通函数实参，不因为子组件内部有条件判断就延迟执行），
 * `sections` 为 null 时（加载中/failed/degraded）当场抛错。用渲染函数才能保证只在
 * `sections && !degraded` 成立、真正决定渲染时才访问 `sections` 的字段。
 */
function NarrativeStatus({
  t, sections, degraded, failed, onRetry, render,
}: {
  t: ReturnType<typeof useT>;
  sections: FengshuiSections | null;
  degraded: boolean;
  failed: boolean;
  onRetry: () => void;
  render: (sections: FengshuiSections) => React.ReactNode;
}) {
  if (sections && !degraded) {
    return <section className="mt-6 flex flex-col gap-6">{render(sections)}</section>;
  }
  if (degraded) {
    return (
      <div className="mt-6">
        <p className="text-[13px] text-muted">{t("fengshui.narrativeDegraded")}</p>
        <button type="button" onClick={onRetry} className="mt-2 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
          {t("fengshui.regenerate")}
        </button>
      </div>
    );
  }
  if (failed && !sections) {
    return (
      <div className="mt-6">
        <p className="text-[13px] text-muted">{t("fengshui.narrativeFailed")}</p>
        <button type="button" onClick={onRetry} className="mt-2 text-[13px]" style={{ color: "var(--color-cinnabar)" }}>
          {t("fengshui.regenerate")}
        </button>
      </div>
    );
  }
  return null;
}

function ViewAsChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[var(--radius-chip)] border px-3 py-1 text-[13px]"
      style={{
        borderColor: active ? "var(--color-cinnabar)" : "var(--color-line)",
        color: active ? "var(--color-cinnabar)" : "var(--color-ink)",
      }}
    >
      {children}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
