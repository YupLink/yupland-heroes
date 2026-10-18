import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings, HelpCircle, ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getActiveBoss, adminUpsertBoss, adminListBosses, adminListRewardTokens, adminForceActivateBoss } from "@/server/api/boss";
import { RewardConfigEditor } from "@/components/admin/RewardConfigEditor";
import { BossImagePicker } from "./BossImagePicker";
import { clampNum, DEF_CFG, toDraftCfg, fromDraftCfg } from "./boss-screen-types";
import type { DraftConfig } from "./boss-screen-types";

export function BossAdminPanel({ onSaved }: { onSaved: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["boss-list"], queryFn: () => adminListBosses() });
  const active = useQuery({ queryKey: ["boss-active"], queryFn: () => getActiveBoss() });
  const tokens = useQuery({ queryKey: ["reward-tokens", "symbols"], queryFn: () => adminListRewardTokens() });
  const [showInfo, setShowInfo] = useState(false);
  const [idx, setIdx] = useState<number | null>(null);
  const [f, setF] = useState<{ id: string; name: string; imageUrl: string; maxHp: string; hpGrowthPct: string; cfg: DraftConfig }>({
    id: "", name: "", imageUrl: "", maxHp: "500000", hpGrowthPct: "10",
    cfg: DEF_CFG,
  });

  const rows = list.data ?? [];
  const sel = idx !== null ? rows[Math.min(idx, Math.max(0, rows.length - 1))] : undefined;
  const status = sel?.queueStatus ?? "active";

  const scriptedHp = (() => {
    const m = new Map<string, { hp: number; pct: number }>();
    const ai = rows.findIndex((b) => b.active);
    if (ai < 0) return m;
    let hp = rows[ai].maxHp;
    for (let j = ai + 1; j < rows.length; j++) {
      const pct = rows[j - 1].hpGrowthPct ?? 10;
      hp = Math.round(hp * (1 + pct / 100));
      if (rows[j].queueStatus === "upcoming") m.set(rows[j].id, { hp, pct });
    }
    return m;
  })();

  useEffect(() => {
    if (!list.data || list.isFetching) return;
    if (idx === null) {
      const ai = list.data.findIndex((b) => b.active);
      setIdx(ai >= 0 ? ai : Math.max(0, list.data.length - 1));
      return;
    }
    const b = list.data[Math.min(idx, list.data.length - 1)];
    if (!b) return;
    setF({
      id: b.id, name: b.name, imageUrl: b.imageUrl ?? "", maxHp: String(b.maxHp),
      hpGrowthPct: String(b.hpGrowthPct ?? 10),
      cfg: b.rewardConfig ? toDraftCfg(b.rewardConfig) : DEF_CFG,
    });
  }, [idx, list.data, list.isFetching]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["boss-list"] }); onSaved(); };
  const save = useMutation({
    mutationFn: () => adminUpsertBoss({ data: {
      ...(f.id ? { id: f.id } : {}),
      name: f.name, imageUrl: f.imageUrl || null,
      ...(Number(f.maxHp) > 0 ? { maxHp: clampNum(f.maxHp, 1, Number.MAX_SAFE_INTEGER, true) } : {}),
      hpGrowthPct: clampNum(f.hpGrowthPct, 0, 1000, false),
      active: status === "active", rewardConfig: fromDraftCfg(f.cfg),
    } }),
    onSuccess: () => { toast.success(t("boss.boss_saved")); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });
  const addUpcoming = useMutation({
    mutationFn: () => {
      const last = rows[rows.length - 1];
      const nextNo = (last?.ordinal ?? rows.length) + 1;
      return adminUpsertBoss({ data: {
        name: t("boss.boss_number", { n: nextNo }), imageUrl: last?.imageUrl ?? null,
        hpGrowthPct: last?.hpGrowthPct ?? 10, active: false, asUpcoming: true,
        rewardConfig: last?.rewardConfig ?? DEF_CFG,
      } });
    },
    onSuccess: async () => {
      toast.success(t("boss.next_boss_queued"));
      await qc.invalidateQueries({ queryKey: ["boss-list"] });
      setIdx(rows.length);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const launchNow = useMutation({
    mutationFn: async () => {
      await adminUpsertBoss({ data: {
        ...(f.id ? { id: f.id } : {}),
        name: f.name, imageUrl: f.imageUrl || null,
        ...(Number(f.maxHp) > 0 ? { maxHp: clampNum(f.maxHp, 1, Number.MAX_SAFE_INTEGER, true) } : {}),
        hpGrowthPct: clampNum(f.hpGrowthPct, 0, 1000, false),
        active: false, rewardConfig: fromDraftCfg(f.cfg),
      } });
      return adminForceActivateBoss({ data: { id: f.id } });
    },
    onSuccess: (r) => {
      toast.success(t("boss.launched_now", { name: r.name }));
      qc.refetchQueries({ queryKey: ["boss-active"] });
      qc.invalidateQueries({ queryKey: ["boss-list"] });
      qc.invalidateQueries({ queryKey: ["boss-session"] });
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("common.error")),
  });

  const rd = active.data?.boss?.roundDamages ?? [];
  const statusBadge =
    status === "defeated" ? { txt: t("boss.status_defeated"), cls: "border-border text-muted-foreground" } :
    status === "upcoming" ? { txt: t("boss.status_queued"), cls: "border-neon/50 text-neon" } :
    { txt: t("boss.status_active"), cls: "border-success/50 text-success" };
  const atLast = idx !== null && rows.length > 0 && idx >= rows.length - 1;
  const editable = status !== "defeated";

  return (
    <div className="space-y-3 rounded-2xl border border-gold/30 bg-card p-3.5 text-sm shadow-card">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setIdx((i) => Math.max(0, (i ?? 0) - 1))} disabled={idx === null || idx <= 0}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border transition enabled:hover:border-gold/50 disabled:opacity-30"
          title={t("boss.prev_defeated_left")}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="inline-flex max-w-full items-center gap-2">
            <span className="truncate font-semibold text-gold">
              {t("boss.boss_ordinal_name", { n: sel?.ordinal ?? "?", name: sel?.name ?? "…" })}
            </span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadge.cls}`}>
              {statusBadge.txt}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {idx !== null ? t("boss.n_of_m", { n: idx + 1, m: rows.length }) : ""} {t("boss.carousel_legend")}
          </div>
        </div>
        {atLast ? (
          <button onClick={() => addUpcoming.mutate()} disabled={addUpcoming.isPending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full gradient-gold text-gold-foreground shadow-gold transition enabled:hover:scale-105 disabled:opacity-50"
            title={t("boss.program_next_boss")}>
            <Plus className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={() => setIdx((i) => Math.min(rows.length - 1, (i ?? 0) + 1))}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border transition hover:border-gold/50"
            title={t("boss.next_upcoming_right")}>
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-semibold text-gold">
          <Settings className="h-4 w-4" />
          {status === "defeated" ? t("boss.archive_view_only") : status === "upcoming" ? t("boss.upcoming_boss_edit") : t("boss.active_boss_edit")}
        </span>
        <button onClick={() => setShowInfo((v) => !v)} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"><HelpCircle className="h-3.5 w-3.5" /> {t("boss.fight_params")}</button>
      </div>

      {showInfo && (
        <div className="space-y-1 rounded-lg border border-border/60 bg-secondary/40 p-2.5 text-[11px] text-muted-foreground">
          <div className="font-medium text-foreground">{t("boss.fixed_balance_title")}</div>
          <div>• {t("boss.balance_energy_pre")} <b>10</b> {t("boss.balance_energy_post")}</div>
          <div>• {t("boss.balance_like_pre")} <b>+0.1</b> {t("boss.balance_like_mid")} <b>≥1000</b></div>
          <div>• {t("boss.balance_boss_dmg")} {rd.map((r) => t("boss.round_dmg_abbr", { round: r.round, dmg: r.dmg })).join(" · ")}</div>
          <div>• {t("boss.balance_monday")}</div>
        </div>
      )}

      {status === "defeated" ? (
        <div className="space-y-2 rounded-xl border border-border/60 bg-secondary/20 p-3">
          {sel?.imageUrl && <img src={sel.imageUrl} alt="" className="mx-auto h-24 w-24 rounded-2xl object-cover" />}
          <div className="text-center font-display text-base font-bold">{sel?.name}</div>
          <div className="text-center text-xs text-muted-foreground">
            ⚔️ {t("boss.archive_defeated_stats", { weeks: sel?.weekNo ?? "?", hp: (sel?.maxHp ?? 0).toLocaleString() })}
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2.5 rounded-xl border border-border/60 bg-secondary/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("boss.boss_label")}</div>
            <input placeholder={t("boss.boss_name_placeholder")} value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
            <BossImagePicker url={f.imageUrl} onUrl={(u) => setF((p) => ({ ...p, imageUrl: u }))} />
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted-foreground">
                {status === "upcoming" ? t("boss.hp_start_optional") : t("boss.hp_start")}
                <input type="number" min={status === "upcoming" ? 0 : 1} value={f.maxHp}
                  onChange={(e) => setF((p) => ({ ...p, maxHp: e.target.value }))}
                  onBlur={() => setF((p) => ({ ...p, maxHp: String(clampNum(p.maxHp, status === "upcoming" ? 0 : 1, Number.MAX_SAFE_INTEGER, true)) }))}
                  className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
              </label>
              <label className="block text-xs text-muted-foreground">{t("boss.hp_growth_per_win")}
                <input type="number" step="1" min={0} max={1000} value={f.hpGrowthPct}
                  onChange={(e) => setF((p) => ({ ...p, hpGrowthPct: e.target.value }))}
                  onBlur={() => setF((p) => ({ ...p, hpGrowthPct: String(clampNum(p.hpGrowthPct, 0, 1000, false)) }))}
                  className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
              </label>
            </div>
            {status === "upcoming" && (
              <>
                {Number(f.maxHp) <= 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {(() => {
                      const sc = sel ? scriptedHp.get(sel.id) : undefined;
                      return sc
                        ? `≈ ${sc.hp.toLocaleString()} · ${t("boss.auto_prev_hp", { pct: sc.pct })}`
                        : t("boss.auto_scripted_hp", { pct: f.hpGrowthPct });
                    })()}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground">{t("boss.hp_upcoming_hint")}</p>
                <p className="text-[10px] text-muted-foreground">{t("boss.upcoming_note")}</p>
              </>
            )}
          </div>

          <RewardConfigEditor cfg={f.cfg} onChange={(cfg) => setF((p) => ({ ...p, cfg }))} tokens={tokens.data ?? []} />

          <button disabled={!f.name || save.isPending || !editable} onClick={() => save.mutate()} className="w-full rounded-lg gradient-gold py-2 text-sm font-bold text-gold-foreground transition enabled:hover:scale-[1.01] disabled:opacity-40">
            {save.isPending ? t("boss.saving") : status === "upcoming" ? t("boss.save_upcoming_boss") : t("boss.save_boss")}
          </button>

          {status === "upcoming" && (
            <button
              disabled={!f.name || launchNow.isPending}
              onClick={() => {
                if (confirm(t("boss.launch_now_confirm", { name: f.name }))) launchNow.mutate();
              }}
              className="w-full rounded-lg border border-success/50 bg-success/10 py-2 text-sm font-bold text-success transition enabled:hover:bg-success/20 disabled:opacity-40"
            >
              {launchNow.isPending ? t("boss.launching") : t("boss.launch_now")}
            </button>
          )}
        </>
      )}

      {rows.length > 0 && (
        <div className="space-y-1 border-t border-border/60 pt-2">
          <p className="text-[10px] text-muted-foreground">{t("boss.monday_cron_note")}</p>
          {rows.map((b, i) => (
            <button key={b.id} onClick={() => setIdx(i)} className={`block w-full truncate text-left text-xs transition hover:text-foreground ${i === idx ? "text-gold" : "text-muted-foreground"}`}>
              {b.queueStatus === "active" ? "🟢" : b.queueStatus === "upcoming" ? "🕓" : "⚔️"} #{b.ordinal} {b.name}
              {b.queueStatus === "upcoming"
                ? ` ${t("boss.list_scripted_hp", { hp: (scriptedHp.get(b.id)?.hp ?? 0).toLocaleString() })}`
                : ` ${t("boss.list_week_hp", { week: b.weekNo, hp: b.currentHp.toLocaleString(), max: b.maxHp.toLocaleString() })}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
