import type React from "react";
import { Swords, Skull } from "lucide-react";
import { useT } from "@/lib/i18n";

export function RaidFightResult({
  autoResult,
  onClose,
  children,
  /** Подпись цели: «Босс» по умолчанию, «Сундук»/«Шахта» в бета-рейде. */
  targetLabel,
  /** Подсказка после победы. В бете (гекс-карта) «дальше по цепочке» неуместно. */
  showForwardHint = true,
  /** Слой окна: в бета-рейде итог ложится ПОВЕРХ открытого окна боя. */
  overlayZ = "z-50",
}: {
  autoResult: {
    killed: boolean;
    dealt: number;
    bossHpAfter: number;
    bossMaxHp: number;
  };
  onClose: () => void;
  targetLabel?: string;
  showForwardHint?: boolean;
  overlayZ?: string;
  /** Доп. блок под цифрами — бета-рейд кладёт сюда итоги способностей. */
  children?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div
      className={`fixed inset-0 ${overlayZ} flex items-center justify-center bg-black/70 p-4`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-gold/30 bg-card p-5 shadow-card animate-float-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/10 text-gold">
            {autoResult.killed ? <Skull className="h-7 w-7" /> : <Swords className="h-7 w-7" />}
          </div>
          <div className="font-display text-xl font-bold">
            {autoResult.killed
              ? targetLabel
                ? `${targetLabel} повержен!`
                : t("raid.boss_defeated_excl")
              : t("raid.fight_over")}
          </div>
          {autoResult.killed && showForwardHint && (
            <div className="mt-1 text-xs font-semibold text-gold">{t("raid.go_forward_hint")}</div>
          )}
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("raid.damage_dealt")}</span>
            <b className="text-gold">{autoResult.dealt.toLocaleString()}</b>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {targetLabel ? `HP · ${targetLabel}` : t("raid.boss_hp")}
            </span>
            <b>
              {autoResult.bossHpAfter.toLocaleString()} / {autoResult.bossMaxHp.toLocaleString()}
            </b>
          </div>
        </div>
        {children}
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl gradient-gold px-4 py-2.5 font-bold text-gold-foreground"
        >
          {t("raid.ok")}
        </button>
      </div>
    </div>
  );
}
