import { Swords, Skull, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { fightBoss } from "@/server/api/boss";

export function BossAutoResult({
  result,
  onClose,
}: {
  result: Awaited<ReturnType<typeof fightBoss>>;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl border border-gold/30 bg-card p-5 shadow-card animate-float-up" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/10 text-gold">
            {result.killed ? <Skull className="h-7 w-7" /> : <Swords className="h-7 w-7" />}
          </div>
          <div className="font-display text-xl font-bold">
            {result.killed ? t("boss.boss_defeated_celebrate") : t("boss.fight_finished")}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {t("boss.autofight_rounds", { n: result.log.length })}
          </div>
          {result.killed && (
            <div className="mt-1.5 text-xs font-semibold text-gold">
              {t("boss.tournament_rewards_monday_claim")}
            </div>
          )}
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("boss.damage_dealt")}</span>
            <b className="text-gold">{result.totalDamage.toLocaleString()}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("boss.boss_hp")}</span>
            <b>{result.bossHpAfter.toLocaleString()} / {result.bossMaxHp.toLocaleString()}</b>
          </div>
          {result.likeAwarded > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("boss.reward")}</span>
              <b className="text-success">{t("boss.plus_likes", { n: result.likeAwarded })}</b>
            </div>
          )}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">{t("boss.battle_log")}</summary>
          <div className="mt-2 max-h-40 space-y-1 overflow-auto text-[11px]">
            {result.log.map((r, i) => (
              <div key={i} className="flex justify-between rounded bg-secondary/30 px-2 py-1">
                <span>{t("boss.round_dmg_to_boss", { round: r.round, dmg: r.playerDmg.toLocaleString() })}</span>
                <span className="text-muted-foreground">
                  {r.bossDmg > 0 ? `${t("boss.boss_reply", { dmg: r.bossDmg })}${r.targetDied ? " ☠" : ""}` : t("boss.final")}
                </span>
              </div>
            ))}
          </div>
        </details>
        <button onClick={onClose}
          className="mt-4 w-full rounded-full gradient-gold py-2.5 text-sm font-bold text-gold-foreground">
          {t("boss.done")}
        </button>
      </div>
    </div>
  );
}
