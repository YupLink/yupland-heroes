// Шахта v2 в окне (ПРАВИЛА §8.59).
//
//  • MineV2OwnerBlock — своя работающая: запас и «сломается через …», режим,
//    «Починить за …» (цена всегда полная, запас → 100 %, режим прежний).
//  • MineBrokenBlock — сломанная или ничья: «Шахта сломана» и «Починить за …
//    и забрать» — любому, кто первым заплатит (прежнему хозяину тоже). Окно
//    после починки не закрываем: новый хозяин сразу видит запас и режим.
//    Встаёт она в базе (как ничья в ответе сервера), режим меняют потом.
//    Срок вышел, а сервер ещё не ответил «сломана» — чиним в прежнем режиме:
//    своя работающая не должна молча падать в базу. Там же «Разобрать · ⚡100»
//    (§8.70, MineDismantleButton) — кроме острова.
//  • Улучшение (§8.74) — у своей работающей шахты мира, MineUpgradeBlock; кружок
//    уровня — у полосы запаса и у «Шахта сломана».
//  • Остров новичка (§8.59 п. 11): своя — только запас («истощится через …»),
//    без режимов и без починки; выработанная — MineSpentBlock, без кнопки.
import { Loader2, Wrench } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { MineV2View } from "@/lib/mineExtra";
import { brokenRepairMode } from "@/lib/mineV2Clock";
import { MineLifeBar } from "./MineLifeBar";
import { MineModePicker } from "./MineModePicker";
import { MineRepairLabel } from "./MineRepairLabel";
import { MineDismantleButton } from "./MineDismantleButton";
import { MineLevelBadge } from "./MineLevelBadge";
import { MineUpgradeBlock } from "./MineUpgradeBlock";
import type { MineV2Resource } from "@/lib/mineV2";
import { useMineRepair } from "./useMineV2Actions";

type Props = { q: number; r: number; v2: MineV2View; now: number };

export function MineV2OwnerBlock({ q, r, v2, now, kind }: Props & { kind: MineV2Resource | null }) {
  const repair = useMineRepair(q, r);
  if (v2.island) {
    return (
      <div className="border-t border-amber-500/20 pt-2">
        <MineLifeBar v2={v2} now={now} />
      </div>
    );
  }
  return (
    <div className="space-y-2 border-t border-amber-500/20 pt-2">
      <MineLifeBar v2={v2} now={now} />
      <MineModePicker q={q} r={r} v2={v2} now={now} />
      {kind && <MineUpgradeBlock q={q} r={r} kind={kind} v2={v2} />}
      <button
        type="button"
        onClick={() => repair.mutate(v2.mode)}
        disabled={repair.isPending}
        className="flex w-full flex-wrap items-center justify-center gap-1.5 rounded-xl border border-amber-400/50 px-3 py-2 text-xs font-semibold text-amber-200 disabled:opacity-50"
      >
        {repair.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wrench className="h-4 w-4" />
        )}
        <MineRepairLabel textKey="mine2.repair_for" cost={v2.repairCost} />
      </button>
    </div>
  );
}

export function MineBrokenBlock({ q, r, v2, onDone }: Omit<Props, "now"> & { onDone: () => void }) {
  const t = useT();
  const repair = useMineRepair(q, r);
  return (
    <>
      <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-destructive">
        {/* Уровень после поломки остаётся (§8.74) — видно, что забираешь. */}
        {!v2.island && <MineLevelBadge level={v2.level ?? 1} />}
        {t("mine2.broken")}
      </p>
      {/* Ничья шахта встаёт новому хозяину в базе — режим он сменит сам. */}
      <button
        type="button"
        onClick={() => repair.mutate(brokenRepairMode(v2))}
        disabled={repair.isPending}
        className="flex w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
      >
        {repair.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wrench className="h-4 w-4" />
        )}
        <MineRepairLabel textKey="mine2.repair_take" cost={v2.repairCost} />
      </button>
      {/* Разобрать (§8.70) — не на острове: там шахты ничьи от рождения. */}
      {!v2.island && <MineDismantleButton q={q} r={r} onDone={onDone} />}
    </>
  );
}

/** Остров: шахту уже чинили, 7 дней вышли — больше не встаёт. */
export function MineSpentBlock() {
  const t = useT();
  return (
    <p className="text-center text-sm font-semibold text-muted-foreground">{t("mine2.spent")}</p>
  );
}
