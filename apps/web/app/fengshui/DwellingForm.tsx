"use client";

import { useEffect, useState } from "react";
import { DIRECTIONS, DIRECTION_LABEL, type Direction } from "@eamvp/core";
import { createDwelling, updateDwelling, type Dwelling } from "@/lib/dwellings";
import { listProfiles, getActiveProfileId, type Profile } from "@/lib/profiles";
import { MAX_COHABITANTS } from "@/lib/fengshui-limits";
import { supabase } from "@/lib/supabase";
import { hasTgSession, tgListProfiles } from "@/lib/tg/client";
import { useIsTelegram, useTgMainButton, haptics } from "@/lib/tg/ui";
import { Segmented as TgSegmented } from "@/components/tg/native";
import { useT } from "@/lib/i18n/I18nProvider";
import { Button } from "@/components/ui";

/**
 * 居所录入（EP-fs-14）。
 * ⚠️ 朝向是本表单唯一容易出错的输入：「向」指大门**朝外**的方向，
 * 相当比例的用户会理解反。三重应对：图形化按钮（非下拉）、明确提示语、
 * 以及「不确定」选项 —— 宁可降级回 Layer 0，也不要一份方向性错误的报告。
 *
 * 同住人选择器上挂着两条限制，**都必须在用户点下去之前就可见**（最终评审 I1/I3）——
 * 这两条此前各只建了一半，共同的表现是「让人勾完、存下、然后什么都不发生」：
 *  - 数量上限（I1）：服务端 `.max(MAX_COHABITANTS)` 早就有，客户端不设限。勾满 9 个
 *    存下去 → 此后每次加载 /fengshui 都 400 → 「叙述暂时生成不出来」+ 一个永远不可能
 *    成功的重试按钮，用户无从把失败和同住人列表联系起来。
 *  - 会员闸门（I3）：合看是会员功能，/fengshui 的消费端早有闸门（`entitled ?
 *    cohabitantInputs : undefined`），选择器这头却完全开放——非会员勾完存下，
 *    没有付费墙、没有提示、什么都不出现。
 */
export function DwellingForm({ initial, onSaved }: { initial?: Dwelling; onSaved: (d: Dwelling) => void }) {
  const t = useT();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<"home" | "office">(initial?.kind ?? "home");
  const [tenancy, setTenancy] = useState<"rent" | "own">(initial?.tenancy ?? "rent");
  const [facing, setFacing] = useState<Direction | null>(initial?.facing ?? null);
  const [touchedFacing, setTouchedFacing] = useState(initial != null);
  const [saving, setSaving] = useState(false);

  // 同住人候选（Task 9b/EP-fs-13/14）：所有档案里排除当前活跃档案自己——他是「我」，
  // 不是「同住人」。memberIds 用 initial?.memberProfileIds 回显，否则编辑一次会静默清空。
  //
  // 回显时按 MAX_COHABITANTS 截断（最终评审 I1）：上限是后加的，此前存下来的居所可能
  // 带着 9 个以上的 member id。不截断的话，用户编辑一次这种历史居所、原样存回去，
  // 就把那份「每次加载 /fengshui 都被服务端 400」的坏数据又续了一次命——编辑正是
  // 用户唯一能修正它的入口，这里必须顺手把它拉回合法范围。
  const [candidates, setCandidates] = useState<Profile[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>(
    () => (initial?.memberProfileIds ?? []).slice(0, MAX_COHABITANTS),
  );
  /**
   * 合看（同住人对照）的会员闸门（最终评审 I3）。
   *
   * ⚠️ 只有一个布尔量，而且**只在服务端明确答「不放行」时才置 true**：探测在途、
   * 探测失败、200 但 body 读不出布尔，一律保持 false（= 不挡）。理由与
   * `../object/page.tsx` 顶部那段一致，也与 Task 10 修复单 Critical 1 立下的规矩
   * 一致——「不知道」不等于「没有权限」，`BILLING_ENABLED` 未设置（默认配置）时
   * 服务端对任何人都放行，把一次网络抖动渲染成「这是会员功能」是在向本来就有
   * 权限的用户推销。真正的防线在服务端（POST /api/fengshui/reading 的 402）。
   *
   * 为什么闸门在这里而不在调用方页面：本表单是「勾选同住人」这个动作的**唯一**
   * 发生地，而 /fengshui 的合看消费端（page.tsx 的 `effectiveCohabitantInputs =
   * entitled ? … : undefined`）早就有闸门了——I3 的缺口正是「勾得下去、存得进去、
   * 然后什么都不出现」。闸门贴着动作本身才堵得住。探测也因此可以精确地只在
   * 「确实要渲染选择器」（有候选人）时才发起，不像放在页面层那样对只有一个档案的
   * 用户白发一次网络往返。
   */
  const [cohabitantBlocked, setCohabitantBlocked] = useState(false);
  // EP-fs-tg：TG 内保存走原生 MainButton（页内按钮隐藏）；web 路径保持页内按钮不变。
  const inTg = useIsTelegram();

  useTgMainButton({
    text: saving ? t("fengshui.dwelling.saving") : t("fengshui.dwelling.save"),
    onClick: () => save(),
    enabled: touchedFacing && !saving,
    visible: inTg,
  });

  useEffect(() => {
    let cancelled = false;
    // EP-fs-tg：TG 会话下匿名 Supabase 客户端读不到档案（RLS 下为空），候选人必须走
    // tgListProfiles() 中介——否则 TG 里同住人选择器永远不渲染，合看无从选起。
    // TG 的「当前档案」恒为列表第一条（getProfileForUser 按创建时间倒序取首条，
    // profiles/page.tsx 用的是同一约定），过滤掉自己。
    const fetcher = hasTgSession() ? tgListProfiles() : listProfiles();
    fetcher
      .then((list) => {
        if (cancelled) return;
        const activeId = hasTgSession() ? (list[0]?.id ?? null) : getActiveProfileId();
        setCandidates(list.filter((p) => p.id !== activeId));
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 会员闸门探测。与 /fengshui、/fengshui/object 共用同一个 GET 端点与同一份服务端
  // 判断（`isFengshuiEntitled`），不另写一份规则。没有候选人时选择器根本不渲染，
  // 探测结果影响不到任何东西——不发这次请求。
  useEffect(() => {
    if (candidates.length === 0) return;
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
        if (cancelled || !r.ok) return; // 非 2xx = 基础设施失败，不是「判定你不是会员」
        const body = (await r.json().catch(() => null)) as { entitled?: boolean } | null;
        if (cancelled || typeof body?.entitled !== "boolean") return; // 同理：读不出布尔值 = 未知
        setCohabitantBlocked(!body.entitled);
      } catch {
        // 探测本身失败：资格未知 → 不挡（见上方 state 注释）。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidates.length]);

  /** 已选满：再勾就会撞上服务端的 `.max(MAX_COHABITANTS)`（最终评审 I1）。 */
  const atMemberLimit = memberIds.length >= MAX_COHABITANTS;

  function toggleMember(id: string) {
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    haptics.light();
    setSaving(true);
    try {
      const payload = {
        name: name.trim() || t("fengshui.dwelling.namePlaceholder"),
        kind, tenancy, facing, memberProfileIds: memberIds,
      };
      const saved = initial
        ? (await updateDwelling(initial.id, payload), { ...initial, ...payload })
        : await createDwelling(payload);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-[13px] text-ink-2">
        {t("fengshui.dwelling.nameLabel")}
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t("fengshui.dwelling.namePlaceholder")} className="w-full" />
      </label>

      {inTg ? (
        // TG：与「境」页 tab 行共用同一个原生分段组件（评审 M1——此前本文件的本地
        // Segmented 与 native.tsx 的同名组件 prop 形状不兼容，且 TG 下这两个选择器
        // 保持网页外观、与上方原生 tab 行不一致）。组模式（不传 idBase）：它们是
        // 互斥选项而非 tab。
        <TgSegmented
          ariaLabel={t("fengshui.dwelling.kindLabel")}
          options={[
            { value: "home" as const, label: t("fengshui.dwelling.kindHome") },
            { value: "office" as const, label: t("fengshui.dwelling.kindOffice") },
          ]}
          value={kind}
          onChange={setKind}
        />
      ) : (
        <OptionButtons value={kind} onChange={setKind}
          options={[["home", t("fengshui.dwelling.kindHome")], ["office", t("fengshui.dwelling.kindOffice")]]} />
      )}
      {inTg ? (
        <TgSegmented
          ariaLabel={t("fengshui.dwelling.tenancyLabel")}
          options={[
            { value: "rent" as const, label: t("fengshui.dwelling.tenancyRent") },
            { value: "own" as const, label: t("fengshui.dwelling.tenancyOwn") },
          ]}
          value={tenancy}
          onChange={setTenancy}
        />
      ) : (
        <OptionButtons value={tenancy} onChange={setTenancy}
          options={[["rent", t("fengshui.dwelling.tenancyRent")], ["own", t("fengshui.dwelling.tenancyOwn")]]} />
      )}

      <div>
        <p className="text-[13px] text-ink-2">{t("fengshui.dwelling.facingLabel")}</p>
        <p className="mt-1 text-[12px] text-muted">{t("fengshui.dwelling.facingHint")}</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {DIRECTIONS.map((d) => (
            <button key={d} type="button"
              onClick={() => { setFacing(d); setTouchedFacing(true); }}
              className="rounded-[var(--radius-button)] border px-2 py-2 text-[14px]"
              style={{
                borderColor: facing === d ? "var(--color-cinnabar)" : "var(--color-line)",
                color: facing === d ? "var(--color-cinnabar)" : "var(--color-ink)",
              }}>
              {DIRECTION_LABEL[d]}
            </button>
          ))}
          <button type="button"
            onClick={() => { setFacing(null); setTouchedFacing(true); }}
            className="col-span-4 rounded-[var(--radius-button)] border px-2 py-2 text-[13px]"
            style={{
              borderColor: touchedFacing && facing === null ? "var(--color-cinnabar)" : "var(--color-line)",
              color: touchedFacing && facing === null ? "var(--color-cinnabar)" : "var(--color-muted)",
            }}>
            {t("fengshui.dwelling.facingUnknown")}
          </button>
        </div>
      </div>

      {candidates.length > 0 && (
        <div>
          <p className="text-[13px] text-ink-2">{t("fengshui.dwelling.membersLabel")}</p>
          <p className="mt-1 text-[12px] text-muted">{t("fengshui.dwelling.membersHint")}</p>
          {/* 两条说明互斥、语义不同，不可互借：
              - membersMemberOnly（I3）：合看本身是会员功能，勾了也不会有任何产出；
              - membersLimitNote（I1）：有权限，但已经选满，再勾会被服务端 400。
              两者都必须**先于**用户点下去就说清楚——这两条缺口此前的表现都是「让人
              勾完、存下、然后无声无息」（前者永远静默，后者在另一个页面上炸）。*/}
          {cohabitantBlocked ? (
            <p className="mt-1 text-[12px]" style={{ color: "var(--color-cinnabar)" }}>
              {t("fengshui.dwelling.membersMemberOnly")}
            </p>
          ) : atMemberLimit ? (
            <p className="mt-1 text-[12px]" style={{ color: "var(--color-cinnabar)" }}>
              {t("fengshui.dwelling.membersLimitNote", { max: MAX_COHABITANTS })}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {candidates.map((p) => {
              const selected = memberIds.includes(p.id);
              // 已选中的永远可点（否则选满之后连"取消"都做不到，是个死局）；
              // 未选中的在「非会员」或「已达上限」时禁用——禁用态是这两条上限
              // 唯一的执行点，`disabled` 一旦被摘掉，上限就整个失效。
              const disabled = cohabitantBlocked || (atMemberLimit && !selected);
              return (
                <button key={p.id} type="button"
                  onClick={() => toggleMember(p.id)}
                  disabled={disabled}
                  className="rounded-[var(--radius-button)] border px-3 py-1.5 text-[13px] disabled:opacity-50"
                  style={{
                    borderColor: selected ? "var(--color-cinnabar)" : "var(--color-line)",
                    color: selected ? "var(--color-cinnabar)" : "var(--color-ink)",
                  }}>
                  {p.nickname}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!inTg && (
        <Button onClick={save} disabled={saving || !touchedFacing}>
          {saving ? t("fengshui.dwelling.saving") : t("fengshui.dwelling.save")}
        </Button>
      )}
    </div>
  );
}

/**
 * web 宿主的互斥选项行（评审 M1 前叫 Segmented，与 components/tg/native.tsx 的
 * 原生分段组件同名且 prop 形状不兼容——改名消除撞名；TG 宿主改用那个共享组件）。
 */
function OptionButtons<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: [T, string][];
}) {
  return (
    <div className="flex gap-2">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className="flex-1 rounded-[var(--radius-button)] border py-2 text-[14px]"
          style={{
            borderColor: value === v ? "var(--color-cinnabar)" : "var(--color-line)",
            color: value === v ? "var(--color-cinnabar)" : "var(--color-ink)",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}
