"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  computeFengshui, FENGSHUI_ENGINE_VERSION, directionsFor, DIRECTION_LABEL,
  type FengshuiChart, type DwellingInput, type CohabitantInput,
} from "@eamvp/core";
import { getActiveProfile, getProfile, type Profile } from "@/lib/profiles";
import { listDwellings, type Dwelling } from "@/lib/dwellings";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";
import { BaguaWheel } from "@/components/charts/BaguaWheel";
import { Markdown } from "@/components/Markdown";
import { Card } from "@/components/ui";
import {
  fengshuiFingerprint, readFengshuiReport, saveFengshuiReport, type FengshuiSections,
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

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  // 居所：取第一个（多居所切换属会员权益，Task 10 处理）。依赖 profile 而非并行加载，
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
            const ids = d?.facing ? d.memberProfileIds : [];
            const m = ids.length
              ? (await Promise.all(ids.map((id) => getProfile(id).catch(() => null)))).filter(
                  (p): p is Profile => p != null,
                )
              : [];
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

  // 确定性派生：与 LLM 无关，永远可得
  const fs: FengshuiChart | null = useMemo(
    () =>
      profile
        ? computeFengshui({ birth: profile.birthInput, chart: profile.chart, dwelling: dwellingInput, cohabitants: cohabitantInputs })
        : null,
    [profile, dwellingInput, cohabitantInputs],
  );

  useEffect(() => {
    // dwellings/cohabitantProfiles 未落定前不发起请求——否则「profile 就绪但居所还在
    // 加载」这个瞬间会先按 Layer 0 请求一次，居所到手后 fs 变成 Layer 1 又请求第二次。
    if (!profile || !fs || dwellings === undefined || cohabitantProfiles === undefined) return;
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
    const fp = fengshuiFingerprint({
      profileId: profile.id, locale, engineVersion: FENGSHUI_ENGINE_VERSION,
      dwelling: dwellingInput
        ? { id: dwellingInput.id, facing: dwellingInput.facing, tenancy: dwellingInput.tenancy, kind: dwellingInput.kind }
        : null,
      memberProfileIds: dwellingInput ? (dwelling?.memberProfileIds ?? []) : [],
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
        const r = await fetch("/api/fengshui/reading", {
          method: "POST",
          headers: { "content-type": "application/json", "x-zj-locale": locale },
          body: JSON.stringify({
            ...profile.birthInput,
            dwelling: dwellingInput,
            cohabitants: (cohabitantProfiles ?? []).map((p) => ({
              profileId: p.id, name: p.nickname, birth: p.birthInput,
            })),
          }),
        });
        if (!r.ok) throw new Error(await r.text());
        const data = (await r.json()) as { sections: FengshuiSections; degraded: boolean };
        if (cancelled) return;
        setSections(data.sections);
        setDegraded(data.degraded);
        // 不可信叙述不落盘，避免一份带瑕疵的报告被永久复用（沿用波1的约束）。
        // 持久化失败不影响本次已展示的结果（state 上面已更新），所以不改 UI；
        // 但同样要留痕——写不进去意味着下次加载还得再花一次 LLM 钱。
        if (!data.degraded) {
          await saveFengshuiReport({
            fingerprint: fp, profileId: profile.id, dwellingId: dwellingInput?.id ?? null,
            layer: fs.layer, locale, sections: data.sections,
          }).catch((e) => console.warn("[fengshui] 报告持久化失败，下次加载会重新生成", e));
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => { cancelled = true; };
  }, [profile, fs, dwelling, dwellingInput, cohabitantProfiles, dwellings, locale, retryNonce]);

  function regenerate() {
    setRetryNonce((n) => n + 1);
  }

  function retryDwellings() {
    setDwellingsRetryNonce((n) => n + 1);
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
  const activeCohabitant = f.layer === 1 ? f.cohabitants.find((c) => c.profileId === viewAs) : undefined;
  const activeMingGua = activeCohabitant?.mingGua ?? f.mingGua;
  const activeVerdicts = activeCohabitant ? directionsFor(activeCohabitant.mingGua.guaName) : f.personalDirections;
  const hasCohabitants = f.layer === 1 && f.cohabitants.length > 0;

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <h1 className="text-[24px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.title")}</h1>
      <p className="mt-1 text-[13px] text-muted">{t("fengshui.subtitle")}</p>

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

      {tab === "chart" && (
        <>
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

          {f.layer === 1 && (
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
          )}

          {f.layer === 0 && dwellings !== undefined && (
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
        </>
      )}

      {tab === "remedy" && (
        <section className="mt-6">
          <h2 className="text-[18px]" style={{ fontFamily: "var(--font-serif)" }}>{t("fengshui.remedyTitle")}</h2>
          <NarrativeStatus
            t={t}
            sections={sections}
            degraded={degraded}
            failed={failed}
            onRetry={regenerate}
            render={(s) => <div className="reading-prose mt-2"><Markdown text={s.actions} /></div>}
          />
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
        </section>
      )}

      {tab === "object" && (
        <section className="mt-6">
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
