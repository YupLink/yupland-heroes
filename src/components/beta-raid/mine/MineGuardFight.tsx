// Бой с охранником шахты — глазами атакующего. HP-карточка (BossVault) + пикер
// отряда + «В бой». Формула и окно — как у боссов карты, но у охранника нет
// наград: победа лишь открывает шахту к захвату. Живёт внутри окна шахты.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Swords, Zap, Sword } from "lucide-react";
import { toast } from "sonner";
import { gameInfoToast } from "@/lib/gameInfoToast";
import { humanError } from "@/lib/humanError";
import { useT, useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { ENERGY_KEY, useEnergy } from "@/lib/hooks/useEnergy";
import { BossVault } from "@/components/raid/BossVault";
import { ChipSquadPicker } from "@/components/game/ChipSquadPicker";
import { useRememberedLineup } from "../useRememberedLineup";
import { attackMineGuard } from "@/server/api/beta-raid/mine-guard-attack";
import { BetaAbilityBadges } from "../BetaAbilityBadges";
import { RaidFightResult } from "@/components/raid/RaidFightResult";
import { BetaFightSummary } from "../BetaFightSummary";
import { useState } from "react";
import type { ChestSeized } from "@/lib/magicChest";

/** Энергия за удар по охраннику — как у боссов карты (DEFAULT_COST). */
const GUARD_COST = 10;

type Guardian = {
  name: string;
  image: string | null;
  background: string | null;
  maxHp: number;
  currentHp: number;
  damage: string | null;
  /** value/duration бывают диапазоном «10-20» — как у боссов карты. */
  abilities?: Array<{
    kind: string;
    chance: number;
    value: string | number;
    duration: string | number;
  }>;
};

/**
 * Итог удара для окна-хозяина. seized — охрана магического сундука пала, и
 * сундук с сетью уже в «Добыче» победителя: окно показывает, что ушло.
 */
export type GuardHitResult = {
  killed: boolean;
  hpAfter: number;
  maxHp: number;
  seized: ChestSeized | null;
};

/** Что показать в окне сводки удара — тот же контракт, что у обычных боссов. */
type FightResult = {
  killed: boolean;
  wiped: boolean;
  dealt: number;
  hpAfter: number;
  maxHp: number;
  rounds: number;
  log?: unknown;
  abilityLog?: unknown;
  abilityTotals?: unknown;
};

export function MineGuardFight({
  q,
  r,
  guardian,
  onDefeated,
  title,
  onHit,
  onResult,
}: {
  q: number;
  r: number;
  guardian: Guardian;
  onDefeated: () => void;
  /** Подпись охраны: у сундука своя («Охрана сундука»), по умолчанию — шахты. */
  title?: string;
  /**
   * После любого удара — окно-хозяин перечитывает HP охранника. И после
   * сорвавшегося: добивающий UPDATE мог записаться, а ответ потеряться.
   */
  onHit?: () => void;
  /** Итог каждого удара (HP после, захват сундука). */
  onResult?: (res: GuardHitResult) => void;
}) {
  const t = useT();
  const label = title ?? t("mine.guard_title");
  const lang = useLang();
  const qc = useQueryClient();
  const [lineup, setLineup] = useRememberedLineup();
  const energy = useEnergy().data?.energy ?? 0;
  const canFight = lineup.length > 0;
  const notEnough = energy < GUARD_COST;

  const [result, setResult] = useState<FightResult | null>(null);

  const attack = useMutation({
    mutationFn: () =>
      attackMineGuard({
        data: {
          q,
          r,
          lineup: lineup.map((c) => ({
            templateId: c.templateId,
            level: c.level,
            serialNo: c.serialNo ?? null,
            ...(c.training ? { training: true, trainingId: c.trainingId } : {}),
          })),
        },
      }),
    onSuccess: (res) => {
      // Урон/смерть охранника + энергия видны сразу: перечитываем окно шахты
      // (guardian/can), оверлей охранников, флаги и энергию.
      for (const key of [
        ["beta-raid-building", q, r],
        ["beta-raid-mine-guards"],
        ["beta-raid-mine-flags"],
        ENERGY_KEY,
        ["my-chip-inventory"],
        ["beta-raid-state"],
      ]) {
        qc.invalidateQueries({ queryKey: key, refetchType: "all" });
      }
      setResult({
        killed: res.killed,
        wiped: res.wiped,
        dealt: res.dealt,
        hpAfter: res.hpAfter,
        maxHp: res.maxHp,
        rounds: res.rounds,
        log: res.log,
        abilityLog: res.abilityLog,
        abilityTotals: res.abilityTotals,
      });
      onHit?.();
      onResult?.({
        killed: res.killed,
        hpAfter: res.hpAfter,
        maxHp: res.maxHp,
        seized: res.seized ?? null,
      });
      if (res.killed) onDefeated();
      // Оглушение объясняем сразу — иначе непонятно, почему отряд поредел.
      for (const e of res.chipEffects ?? []) {
        if (e.kind !== "stun") continue;
        gameInfoToast.warning(
          t("braid.toast_stunned", { chip: e.chip ?? t("braid.chip"), n: e.minutes }),
        );
      }
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      onHit?.();
    },
  });

  return (
    <div className="space-y-2.5">
      <BossVault
        boss={{
          name: localizeAssetName(guardian.name, lang),
          imageUrl: guardian.image,
          backgroundUrl: guardian.background,
          badgeLabel: label,
          maxHp: guardian.maxHp,
          currentHp: guardian.currentHp,
        }}
        isFinal={false}
        alive
        locationBg={guardian.background}
        badgeTone="boss"
      />

      {(guardian.abilities?.length ?? 0) > 0 && (
        <BetaAbilityBadges
          abilities={(guardian.abilities ?? []).map((a) => ({
            kind: a.kind,
            chance: a.chance,
            value: a.value,
            duration: a.duration,
          }))}
        />
      )}

      {guardian.damage && (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/5 px-3 py-2">
          <Sword className="h-4 w-4 shrink-0 text-destructive" />
          <span className="text-xs font-semibold text-muted-foreground">
            {t("braid.damage_per_hit")}
          </span>
          <span className="ml-auto font-display text-sm font-bold tabular-nums text-destructive">
            {guardian.damage}
          </span>
        </div>
      )}

      <ChipSquadPicker lineup={lineup} setLineup={setLineup} allowTraining />

      {result && (
        <RaidFightResult
          autoResult={{
            killed: result.killed,
            dealt: result.dealt,
            bossHpAfter: result.hpAfter,
            bossMaxHp: result.maxHp,
          }}
          targetLabel={label}
          showForwardHint={false}
          overlayZ="z-[110]"
          onClose={() => setResult(null)}
        >
          <BetaFightSummary
            log={result.log ?? []}
            abilityLog={result.abilityLog ?? []}
            totals={result.abilityTotals}
            rounds={result.rounds}
            wiped={result.wiped}
          />
        </RaidFightResult>
      )}

      <button
        type="button"
        onClick={() => attack.mutate()}
        disabled={attack.isPending || notEnough || !canFight}
        className="flex w-full items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
      >
        {attack.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Swords className="h-5 w-5" />
        )}
        {notEnough
          ? t("braid.need_energy", { n: GUARD_COST })
          : !canFight
            ? t("braid.build_squad")
            : t("mine.guard_fight")}
        {!attack.isPending && !notEnough && canFight && (
          <span className="inline-flex items-center gap-0.5 text-sm font-semibold opacity-80">
            <Zap className="h-3.5 w-3.5" />
            {GUARD_COST}
          </span>
        )}
      </button>
    </div>
  );
}
