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
import { rewardsLine } from "./lootLabels";
import { serverBadgeLabel } from "./objectKind";
import { markCellDefeated } from "./markDefeated";
import { attackRefreshKeys } from "./attackRefresh";
import { humanError } from "@/lib/humanError";
import { invalidateBackpack, invalidateRaidMap } from "@/lib/query";
import { announceDropped } from "./loot-bag/lootBagLive";
import { useT } from "@/lib/i18n";

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
  slowed?: { extraCost: number; minutes: number } | null;
  chipEffects?: Array<{ kind: "poison" | "stun"; minutes: number; chip?: string | null }>;
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
};

type Target = { objectId: string; q: number; r: number };

export function useBetaEncounter() {
  const t = useT();
  const qc = useQueryClient();
  const [encounter, setEncounter] = useState<Target | null>(null);
  const [fightResult, setFightResult] = useState<AttackResult | null>(null);
  /** Что сейчас забираем — по этой клетке карточка показывает спиннер. */
  const [collecting, setCollecting] = useState<string | null>(null);

  const attack = useMutation({
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
    onSuccess: (res, args) => {
      const r = res as AttackResult;
      setCollecting(null);
      // Цель жива — остаёмся в окне боя: бить дальше, не открывая её заново.
      if (r.killed) setEncounter(null);
      // Опустошённую клетку гасим точечно: перекачивать всю карту ради одной
      // монетки незачем.
      if (r.killed) markCellDefeated(qc, args.q, args.r);
      // Под забранным объектом мог прятаться беглец — открываем его на карте
      // сразу, иначе гриб «исчезал» вместе с укрытием до перечитывания карты.
      applyReveal(qc, (r as { reveal?: Reveal | null }).reveal);
      // Подбор проходит без окна — только тост с добычей.
      if (!r.pickup) setFightResult(r);

      // Лёгкое — всегда и даже неактивным; тяжёлое — только если удар его
      // менял и только у открытых экранов (attackRefresh.ts).
      const refresh = attackRefreshKeys(r);
      for (const key of refresh.all) qc.invalidateQueries({ queryKey: key, refetchType: "all" });
      for (const key of refresh.active) qc.invalidateQueries({ queryKey: key });
      // Карту и раскладку тоже: markCellDefeated — только оптимистичный
      // патч, а как только карта перечитается по соседнему поводу (SSE
      // built/restored, шаг игрока), сервер вернёт объект живым до
      // dead-sweep. Без этой инвалидации убитый босс «воскресал» на клиенте
      // до F5 — жаловались 14.09 и Гермес, и админ.
      invalidateRaidMap(qc);
      // Карточку перечитываем только ТЕКУЩЕЙ цели: прочие в кэше — давно
      // ушедшие цели, им сервер ответил бы «Объект не найден» (02.10).
      const encKey = ["beta-encounter", args.objectId, args.q, args.r];
      if (r.killed) qc.removeQueries({ queryKey: encKey });
      else void qc.invalidateQueries({ queryKey: encKey });
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
    onError: (e: Error) => {
      setCollecting(null);
      toast.error(humanError(e));
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
