import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getActiveBoss, adminListBosses, adminListRewardTokens, adminReleaseMiniBoss, adminEndMiniBoss } from "@/server/api/boss";
import { RewardConfigEditor } from "@/components/admin/RewardConfigEditor";
import { BossImagePicker } from "./BossImagePicker";
import { clampNum, DEF_CFG, fromDraftCfg } from "./boss-screen-types";
import type { DraftConfig } from "./boss-screen-types";

export function MiniBossPanel({ onSaved }: { onSaved: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const active = useQuery({ queryKey: ["boss-active"], queryFn: () => getActiveBoss() });
  const list = useQuery({ queryKey: ["boss-list"], queryFn: () => adminListBosses() });
  const tokens = useQuery({ queryKey: ["reward-tokens", "symbols"], queryFn: () => adminListRewardTokens() });

  const boss = active.data?.boss;
  const miniActive = !!boss?.isMini;
  const miniKilled = miniActive && (boss.currentHp <= 0 || !!boss.killedAt);
  const hpPct = miniActive && boss.maxHp > 0
    ? Math.max(0, Math.min(100, (boss.currentHp / boss.maxHp) * 100)) : 0;

  const [f, setF] = useState<{ name: string; imageUrl: string; maxHp: string; cfg: DraftConfig }>({
    name: "", imageUrl: "", maxHp: "50000", cfg: DEF_CFG,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["boss-active"] });
    qc.invalidateQueries({ queryKey: ["boss-list"] });
    onSaved();
  };
  const release = useMutation({
    mutationFn: () => adminReleaseMiniBoss({ data: {
      name: f.name, imageUrl: f.imageUrl || null,
      maxHp: clampNum(f.maxHp, 1, Number.MAX_SAFE_INTEGER, true),
      rewardConfig: fromDraftCfg(f.cfg),
    } }),
    onSuccess: (r) => { toast.success(`Мини-босс выпущен · главный «${r.pausedMain}» на паузе`); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });
  const end = useMutation({
    mutationFn: () => adminEndMiniBoss(),
    onSuccess: (r) => { toast.success(`Мини-босс завершён${r.restoredMain ? ` · вернулся «${r.restoredMain}»` : ""}`); refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Ошибка"),
  });

  const pastMinis = (list.data ?? []).filter((b) => b.isMini && b.queueStatus === "defeated");

  return (
    <div className="space-y-3 rounded-2xl border border-success/30 bg-card p-3.5 text-sm shadow-card">
      <div className="flex items-center gap-1.5 font-semibold text-success">
        <Zap className="h-4 w-4" /> Мини-босс
      </div>
      <p className="text-[11px] text-muted-foreground">
        Разовое событие: временно замещает главного босса. Пока мини активен —
        главный на паузе (заморожен). Убьют до понедельника → награды раздаются
        сразу, главного возвращаешь кнопкой. Не убьют → в понедельник мини
        лечится и исчезает без наград, главный возвращается сам.
      </p>

      {miniActive ? (
        <div className="space-y-3">
          <div className="space-y-2 rounded-xl border border-success/40 bg-secondary/20 p-3">
            {boss.imageUrl && <img src={boss.imageUrl} alt="" className="mx-auto h-24 w-24 rounded-2xl object-cover" />}
            <div className="text-center font-display text-base font-bold">{boss.name}</div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-success transition-all" style={{ width: `${hpPct}%` }} />
            </div>
            <div className="text-center text-xs text-muted-foreground">
              HP {boss.currentHp.toLocaleString()} / {boss.maxHp.toLocaleString()}
              {miniKilled && <span className="ml-1.5 font-bold text-success">· ПОВЕРЖЕН</span>}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {miniKilled
              ? "Мини-босс повержен — награды уже розданы (игроки забирают кнопкой). Заверши, чтобы вернуть главного босса в бой."
              : "Мини-босс ещё жив. Можно завершить досрочно (наград НЕ будет) — или дождаться победы игроков."}
          </p>
          <button disabled={end.isPending} onClick={() => end.mutate()}
            className="w-full rounded-lg border border-success/50 bg-success/10 py-2 text-sm font-bold text-success transition enabled:hover:bg-success/20 disabled:opacity-40">
            {end.isPending ? "Завершаю…" : "Завершить мини-босса · вернуть главного"}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="space-y-2.5 rounded-xl border border-border/60 bg-secondary/20 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Новый мини-босс</div>
            <input placeholder="Имя мини-босса" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
            <BossImagePicker url={f.imageUrl} onUrl={(u) => setF((p) => ({ ...p, imageUrl: u }))} />
            <label className="block text-xs text-muted-foreground">HP (задаётся напрямую)
              <input type="number" min={1} value={f.maxHp}
                onChange={(e) => setF((p) => ({ ...p, maxHp: e.target.value }))}
                onBlur={() => setF((p) => ({ ...p, maxHp: String(clampNum(p.maxHp, 1, Number.MAX_SAFE_INTEGER, true)) }))}
                className="mt-0.5 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
            </label>
          </div>
          <RewardConfigEditor cfg={f.cfg} onChange={(cfg) => setF((p) => ({ ...p, cfg }))} tokens={tokens.data ?? []} />
          <button disabled={!f.name || release.isPending} onClick={() => release.mutate()}
            className="w-full rounded-lg bg-success py-2.5 text-sm font-bold text-background shadow-card transition enabled:hover:brightness-110 disabled:opacity-40">
            {release.isPending ? "Выпускаю…" : "🐣 Выпустить мини-босса"}
          </button>
          <p className="text-[10px] text-muted-foreground">
            Поставит текущего главного босса на паузу и выпустит мини вместо него.
          </p>
        </div>
      )}

      {pastMinis.length > 0 && (
        <div className="space-y-1 border-t border-border/60 pt-2">
          <p className="text-[10px] text-muted-foreground">Прошлые мини-боссы:</p>
          {pastMinis.map((b) => (
            <div key={b.id} className="truncate text-xs text-muted-foreground">
              🐣 #{b.ordinal} {b.name} · HP {b.maxHp.toLocaleString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
