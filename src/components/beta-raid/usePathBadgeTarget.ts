// Что показывает плашка маршрута: конечная клетка, шаги, счёт по энергии и
// плата за ворота на пути. Вынесено из BetaRaidCanvas (лимит ≤250 строк).
//
// Считаем по самому пути, ничего не дублируя: шаги — его длина, дорога —
// сумма цен шагов, ворота — по словарю цен дверей (pathTolls).
//
// Декор пишет надпись действия своего шаблона («Срубить», 29.09); нет её —
// прежнее «Уничтожить». Дело лопаты (§8.24) — «Копать» / «Закопать» /
// «Выкопать» из предложения лопаты; «копать под собой» — плашка без маршрута.
import { useMemo } from "react";
import { tFor } from "@/lib/i18n";
import type { Lang } from "@/lib/store";
import { labelFor } from "@/lib/raid/decorInteract";
import { DIG_ENERGY } from "@/lib/lootBag";
import { scaleEnergy } from "@/lib/raid/island/energy";
import { useEnergyMult } from "@/components/beta-raid/useEnergyMult";
import { localizeAssetName } from "@/lib/translations/assetNames";
import type { PortalPrice } from "@/lib/portal";
import type { CanvasProps } from "./betaCanvasProps";
import { pathTolls, splitToll } from "./pathTolls";
import { pathReach, walkEnergy } from "./pathReach";
import { useInteractiveDecor } from "./useInteractiveDecor";
import { SHOVEL_LABEL, useShovelOffer } from "./tool/shovelOffer";

export type PathBadgeTarget = {
  q: number;
  r: number;
  /** Полный счёт: дорога плюс действие в конце. */
  cost: number;
  /** Только дорога (с энергией ворот) — по ней решаем, отпускать ли героя. */
  walkCost: number;
  steps: number;
  actionLabel: string | null;
  /** Плата за ворота на пути без энергии — та стоит в общем счёте ⚡. */
  toll: PortalPrice[];
  /** Клетка дела (у маршрута «дойти и …» — цель, а не соседняя) и что за дело. */
  at?: { q: number; r: number };
  kind?: string | null;
  /** «Копать под собой»: маршрута нет, на плашке только кнопка лопаты. */
  here?: boolean;
  /** Сколько первых шагов оплачено энергией (pathReach): дальше стрелки красные. */
  reach: number;
};

export function usePathBadgeTarget(
  p: Pick<
    CanvasProps,
    "pendingPath" | "pendingAction" | "cells" | "buildings" | "buildingTiers" | "doorTolls"
  >,
  lang: Lang,
  /** Сколько энергии есть — докуда дойдёт герой (reach). */
  energy: number,
): PathBadgeTarget | null {
  const { pendingPath, pendingAction, cells, buildings, buildingTiers, doorTolls } = p;
  // Тот же список, что у тапа по декору (он уже в кэше): без маршрута к декору
  // не запрашиваем. Админ сменил надпись — плашка перепишется сама.
  const decorList = useInteractiveDecor(pendingAction?.kind === "decor").data;
  const shovel = useShovelOffer();
  // Цена дела в конце пути — по шаблону (мировая); на острове режем её ЗДЕСЬ,
  // один раз: источники (тап, декор, лопата) шлют её как есть. Шаги маршрута
  // уже посчитаны с множителем (routeSearch).
  const mult = useEnergyMult();
  const base = useMemo((): Omit<PathBadgeTarget, "reach"> | null => {
    // Последний тап — по своей клетке с лопатой: плашка «копать под собой»
    // важнее прежнего маршрута (тот доживёт свои 5 с невидимым).
    if (shovel?.here) {
      const at = { q: shovel.q, r: shovel.r };
      return {
        ...at,
        cost: scaleEnergy(DIG_ENERGY, mult),
        walkCost: 0,
        steps: 0,
        actionLabel: null,
        toll: [],
        at,
        here: true,
      };
    }
    const last = pendingPath[pendingPath.length - 1];
    if (!last) return null;
    const actionKey =
      pendingAction?.kind === "collect"
        ? "braid.act_collect"
        : pendingAction?.kind === "battle"
          ? "braid.act_fight"
          : pendingAction?.kind === "decor"
            ? "braid.act_decor"
            : pendingAction?.kind === "ship"
              ? "braid.ship_repair"
              : pendingAction?.kind === "mineplan"
                ? "mineplace.act_place"
                : null;
    // Постройка не пишет «Взаимодействовать»: у неё есть имя и уровень
    // (тир 0 = 0 lvl, тир 1 = 1 lvl, …). Их и показываем. Пустое, если у
    // постройки нет тиров вовсе (табличка) — тогда только имя.
    let buildingLabel: string | null = null;
    if (pendingAction?.kind === "build") {
      // Постройку ищем по клетке ДЕЙСТВИЯ (pendingAction.q/r), а не по концу
      // маршрута: маршрут-то ведёт к СОСЕДНЕЙ клетке (на саму постройку не
      // встать), и на ней здания нет — оттого подпись пустела и кнопка писала
      // «Идти» вместо имени с уровнем.
      const cellKey = `${pendingAction.q},${pendingAction.r}`;
      const bid = cells?.[cellKey]?.buildingId ?? null;
      const b = bid ? buildings?.[bid] : null;
      if (b) {
        const tier = buildingTiers?.[cellKey] ?? 0;
        const tiersCount = Array.isArray(b.tiers) ? b.tiers.length : 0;
        const name = localizeAssetName(b.name, lang);
        buildingLabel = name ? (tiersCount > 1 ? `${name} · ${tier} lvl` : name) : null;
      }
    }
    // Декор — по клетке действия, как постройка: там он и стоит.
    let decorLabel: string | null = null;
    if (pendingAction?.kind === "decor") {
      const id = cells?.[`${pendingAction.q},${pendingAction.r}`]?.decorationId;
      decorLabel = id ? labelFor(decorList?.[id]?.label, lang) : null;
    }
    // Дело лопаты: надпись из её предложения по клетке дела, иначе «Копать».
    let digLabel: string | null = null;
    if (pendingAction?.kind === "dig") {
      const same = shovel?.q === pendingAction.q && shovel?.r === pendingAction.r;
      digLabel = tFor(lang, shovel && same ? SHOVEL_LABEL[shovel.act] : "dig.act");
    }
    // Ворота на пути: энергия из их цены входит в дорогу (дверь берёт её тем
    // же счётчиком, что и шаг), остальное — отдельной строкой плашки.
    const toll = splitToll(pathTolls(pendingPath, doorTolls)).rest;
    // Дорога и действие — два счёта: к боссу можно идти без энергии на бой.
    const walkCost = walkEnergy(pendingPath, doorTolls);
    return {
      q: last.q,
      r: last.r,
      cost: walkCost + scaleEnergy(pendingAction?.extraCost ?? 0, mult),
      walkCost,
      actionLabel: decorLabel ?? digLabel ?? (actionKey ? tFor(lang, actionKey) : buildingLabel),
      steps: pendingPath.length,
      toll,
      at: pendingAction ? { q: pendingAction.q, r: pendingAction.r } : { q: last.q, r: last.r },
      kind: pendingAction?.kind ?? null,
    };
  }, [
    pendingPath,
    pendingAction,
    lang,
    cells,
    buildings,
    buildingTiers,
    doorTolls,
    decorList,
    shovel,
    mult,
  ]);
  // Отдельно от base: энергия тикает часто, а цель меняется, лишь когда
  // сменилось число оплаченных шагов, — кадр карты не будится зря.
  const reach = useMemo(
    () => (base ? pathReach(pendingPath, energy, doorTolls) : 0),
    [base, pendingPath, energy, doorTolls],
  );
  return useMemo(() => (base ? { ...base, reach } : null), [base, reach]);
}
