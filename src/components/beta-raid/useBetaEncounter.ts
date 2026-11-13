// Энкаунтер: бой с боссом через окно с отрядом — и мгновенный сбор лута.
//
// Сундук, монетка и артефакт больше не ведут в бой: тап по объекту сразу
// отправляет взаимодействие, а игрок видит награду тостом. Окно с выбором
// отряда осталось только у босса (§13.6 — экран остаётся оркестратором).
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gameInfoToast } from "@/lib/gameInfoToast";
import { betaRaidAttack } from "@/server/api/beta-raid/encounter-attack";
import { applyReveal, type Reveal } from "./applyReveal";
import type { LineChip } from "@/components/game/ChipSquadPicker";
import { rememberLineup } from "@/components/beta-raid/useRememberedLineup";
import { rewardsLine } from "./lootLabels";
import { serverBadgeLabel } from "./objectKind";
import { markCellDefeated, shownRunnerAt } from "./markDefeated";
import { attackRefreshKeys } from "./attackRefresh";
import { encounterKey, encounterTopKey, patchEncounterCard, spendEnergyLocally } from "./fight/fightCachePatch";
import { humanError } from "@/lib/humanError";
import { invalidateBackpack, invalidateRaidMap } from "@/lib/query";
import { announceDropped } from "./loot-bag/lootBagLive";
import { useT } from "@/lib/i18n";
import { takeArtBreaks } from "@/lib/hooks/useArtBroken";
import type { ArtBreakNote } from "@/lib/hero/artBroken";

export type AttackResult = {
  kind: "boss" | "chest" | "mine" | "artifact";
  badgeLabel: string;
  dealt: number;
  killed: boolean;
  hpAfter: number;
  maxHp: number;
  /**
   * dropped — сколько из награды не влезло в рюкзак и выпало мешочком (§8.21);
   * queued — свой товар ждёт в «Добыче» (мешочек не упал или товара нет в справочнике).
   */
  rewards: Array<{
    kind: string;
    amount: number;
    packId: string | null;
    dropped?: number;
    queued?: boolean;
  }>;
  /** Что сработало из способностей цели — показываем в итогах боя. */
  abilityLog?: Array<{ round: number; kind: string; amount: number; chip?: string | null }>;
  /** Поураундовый лог — раскрывается в сводке боя. Длинный бой обрезан. */
  log?: Array<{ round: number; playerDmg: number; targetDmg: number }>;
  /** Итоги по способностям от сервера: лог обрезан, а факт выжигания знает он. */
  abilityTotals?: Record<string, number>;
  /** Сколько раундов было на самом деле — лог мог доехать не целиком. */
  rounds?: number;
  wiped?: boolean;
  burnedEnergy?: number;
  /** Списано за удар вместе с выжженным — цена «Атаковать снова» (fightControl.hitCost). */
  spentEnergy?: number;
  slowed?: { extraCost: number; minutes: number } | null;
  chipEffects?: Array<{ kind: "poison" | "stun"; minutes: number; chip?: string | null }>;
  /** Удар изменил фишки игрока (оглушение) — перечитать инвентарь (attackRefresh). */
  chipsChanged?: boolean;
  /** Забрали без боя — итогового окна не нужно. */
  pickup?: boolean;
  /**
   * Что герой добавил в ЭТОТ бой. undefined в режиме героя означает не «нет
   * героя», а «по боссам бонусы выключены вторым флагом» — сводка так и
   * говорит, иначе игрок ищет пропавшую атаку.
   */
  /** Что герой дал этому бою — ровно те поля, что шлёт encounter-attack. */
  heroBonus?: {
    atkMult: number;
    hpMult: number;
    missPct: number;
    luckPct: number;
    luckMin: number;
    luckMax: number;
  };
  /** Отряд героя: сколько записей и сколько из них осталось дома. */
  heroSquad?: { total: number; busy: number; gone: number };
  /** Сломалось и слетело с героя этим ударом (§8.63 п.3) — плашка над героем. */
  artBroken?: ArtBreakNote[];
};

type Target = { objectId: string; q: number; r: number };
export const ATTACK_KEY = ["beta-raid-attack"];

export function useBetaEncounter() {
  const t = useT();
  const qc = useQueryClient();
  const [encounter, setEncounter] = useState<Target | null>(null);
  const [fightResult, setFightResult] = useState<AttackResult | null>(null);
  /** Что сейчас забираем — по этой клетке карточка показывает спиннер. */
  const [collecting, setCollecting] = useState<string | null>(null);

  const attack = useMutation({
    // По ключу удар тапом видит «уже летит» сразу, не дожидаясь ререндера.
    mutationKey: ATTACK_KEY,
    mutationFn: (args: Target & { lineup?: LineChip[] }) =>
      betaRaidAttack({
        data: {
          objectId: args.objectId,
          q: args.q,
          r: args.r,
          // Тренировочные фишки идут со своим id: сервер ищет их не в
          // инвентаре, а в таблице прихожи, и без него молча выкинул бы их
          // из отряда — ровно то, на что жаловались («ими нельзя сражаться»).
          lineup: (args.lineup ?? []).map((c) => ({
            templateId: c.templateId,
            level: c.level,
            serialNo: c.serialNo ?? null,
            ...(c.training ? { training: true, trainingId: c.trainingId } : {}),
          })),
        },
      }),
    // Слой цели — по карте в момент удара: бьём показанного беглеца или объект клетки.
    onMutate: (args) => ({ runner: shownRunnerAt(qc, args.q, args.r, args.objectId) }),
    onSuccess: (res, args, sent) => {
      const r = res as AttackResult;
      const reveal = (r as { reveal?: Reveal | null }).reveal;
      setCollecting(null);
      // Фишки не были выбраны — сервер взял самые сильные: запоминаем их как отряд.
      const auto = (res as { autoLineup?: Array<{ templateId: string; level: number }> }).autoLineup;
      if (Array.isArray(auto) && auto.length > 0) rememberLineup(auto);
      // Цель жива — остаёмся в окне боя: бить дальше, не открывая её заново.
      if (r.killed) setEncounter(null);
      // Опустошённую клетку гасим точечно: перекачивать всю карту ради одной
      // монетки незачем. Гасим добитый слой: открылся беглец — добит был
      // объект клетки над ним, и беглеца (зайца под мобом) не трогаем.
      if (r.killed) markCellDefeated(qc, args.q, args.r, sent?.runner === true && !reveal);
      // Под забранным объектом мог прятаться беглец — открываем его на карте
      // сразу, иначе гриб «исчезал» вместе с укрытием до перечитывания карты.
      applyReveal(qc, reveal);
      // Подбор проходит без окна — только тост с добычей.
      if (!r.pickup) setFightResult(r);

      // Перечитываем только то, что удар МОГ изменить (attackRefresh.ts);
      // меняющееся в каждом ударе (HP цели, энергия) — из ответа (fightCachePatch).
      const refresh = attackRefreshKeys(r);
      for (const key of refresh.all) qc.invalidateQueries({ queryKey: key, refetchType: "all" });
      for (const key of refresh.active) qc.invalidateQueries({ queryKey: key });
      if (!r.pickup) spendEnergyLocally(qc, r.spentEnergy);
      // Сломанный слетел с героя — плашка над героем и перечит снаряжения.
      takeArtBreaks(qc, r.artBroken);
      // Карту и раскладку — когда цель добита (или под ней открылся беглец):
      // markCellDefeated — только оптимистичный патч, и без перечитывания
      // убитый босс «воскресал» до F5 (14.09). Недобитая цель на карте не
      // меняется — HP в карте нет.
      if (r.killed || reveal) invalidateRaidMap(qc);
      // Карточка ТЕКУЩЕЙ цели: неизменное (шаблон, картинка, способности,
      // награды) уже в окне — правим только HP; добитую убираем. Топ вклада —
      // только её же и только открытый (прочие цели этим ударом не менялись).
      if (r.killed) qc.removeQueries({ queryKey: encounterKey(args) });
      else if (!r.pickup) {
        patchEncounterCard(qc, args, r);
        void qc.invalidateQueries({ queryKey: encounterTopKey(args), exact: true });
      }
      // Замедление, выжигание и урон яда видно в сводке боя — тостами их не
      // дублируем. Отдельно говорим только про оглушение: игрок должен сразу
      // понять, почему отряд поредел, не открывая итог.
      // Сводки боя ниже — информационные: игрок выключает их в настройках.
      for (const e of r.chipEffects ?? []) {
        if (e.kind !== "stun") continue;
        gameInfoToast.warning(
          t("braid.toast_stunned", { chip: e.chip ?? t("braid.chip"), n: e.minutes }),
        );
      }
      // Подпись цели приходит с сервера по-русски — переводим её тут же
      // (авторскую из meta.badgeLabel serverBadgeLabel оставит как есть).
      const badge = serverBadgeLabel(r.kind, r.badgeLabel, t);
      // Свой товар — уже в рюкзаке, не влезшее — мешочком; прочее ждёт в «Добыче».
      const inLoot = (x: AttackResult["rewards"][number]) => x.kind !== "custom" || !!x.queued;
      const queued = r.rewards.filter(inLoot);
      const packed = r.rewards
        .filter((x) => !inLoot(x))
        .map((x) => ({ ...x, amount: x.amount - (Number(x.dropped) || 0) }))
        .filter((x) => x.amount > 0);
      // Легло в рюкзак (§8.21) — перечитать его и окно склада.
      if (packed.length > 0) invalidateBackpack(qc);
      announceDropped(
        qc,
        t,
        r.rewards.reduce((sum, x) => sum + (Number(x.dropped) || 0), 0),
      );
      if (r.killed && r.rewards.length > 0) {
        if (queued.length > 0)
          gameInfoToast.success(t("braid.toast_loot", { badge, rewards: rewardsLine(queued, t) }));
        if (packed.length > 0)
          gameInfoToast.success(
            t("bag.toast_backpack", { badge, rewards: rewardsLine(packed, t) }),
          );
      } else if (r.killed && r.kind === "boss") {
        // Фонд босса делится по местам: добить мало, нужен вклад в урон.
        gameInfoToast.success(t("braid.toast_killed", { badge }));
      } else if (r.killed) {
        gameInfoToast.success(t("braid.toast_emptied", { badge }));
      } else if (r.pickup === false && !r.killed) {
        // Сундук с запасом HP: показываем, сколько осталось. Один тост на
        // серию ударов — обновляется на месте, а не копится стопкой.
        gameInfoToast(
          t("braid.toast_hp_left", {
            badge,
            n: Math.round((r.hpAfter / r.maxHp) * 100),
          }),
          { id: "raid-hp-left" },
        );
      }
    },
    onError: (e: Error, args) => {
      setCollecting(null);
      toast.error(humanError(e));
      // Отказ (цель добили другие, отошёл) — карточку цели сверяем с сервером.
      void qc.invalidateQueries({ queryKey: encounterKey(args), exact: true });
    },
  });

  /** Забрать/открыть объект одним нажатием — без окна боя. */
  const collect = (target: Target) => {
    if (attack.isPending) return;
    setCollecting(`${target.q},${target.r}`);
    attack.mutate(target);
  };

  return { encounter, setEncounter, fightResult, setFightResult, attack, collect, collecting };
}
