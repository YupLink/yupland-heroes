// Занятость фишки, которая уже стоит в слоте отряда.
//
// Инвентарь знает состояние каждого экземпляра, отряд — не всегда: составы
// сохраняются с серийником не везде, а старые записи его не имеют вовсе.
// Раньше такая запись молчала (без серийника экземпляр не опознать), и
// оглушённая боссом фишка стояла в слоте бодрой — игрок узнавал о потере
// только в бою, ровно та жалоба, ради которой занятость и рисуют в замке.
//
// Опознать конкретный экземпляр по шаблону нельзя, но сказать правду о шаблоне
// можно: заняты ВСЕ такие — слот гаснет с таймером ближайшего освобождения;
// занята часть — нейтральная пометка, без обещания, что в бой пойдёт именно
// эта фишка, и без яркого боеспособного вида.
import { useMemo } from "react";
import { chipBusyOf, chipBusyView, type ChipBusyView } from "@/components/chips/chipBusy";
import type { InvChip, InvChipInstance } from "./SquadInventoryGrid";

/** Минимум от записи отряда, чтобы найти её состояние в инвентаре. */
export type SquadLine = { templateId: string; level: number; serialNo?: number | null };

/** «partial» — заняты не все такие фишки, а какая именно в слоте, неизвестно. */
export type SlotBusyKind = ChipBusyView["kind"] | "partial";
export type SlotBusyView = { kind: SlotBusyKind; left: string; hint: string };

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Агрегат по шаблону+уровню: сколько таких есть, сколько занято и кто освободится первым. */
type TemplateBusy = { total: number; busy: number; soonest: InvChipInstance | null };

const keyOf = (templateId: string, level: number) => `${templateId}|${level}`;

function aggregate(chips: InvChip[], nowTick: number): Map<string, TemplateBusy> {
  const m = new Map<string, TemplateBusy>();
  for (const c of chips) {
    const list = c.chips ?? [];
    const agg: TemplateBusy = { total: list.length, busy: 0, soonest: null };
    let soonestMs = Infinity;
    for (const ch of list) {
      const busy = chipBusyOf(ch, nowTick);
      if (!busy) continue;
      agg.busy++;
      // Ближайшее освобождение считаем по той же занятости, что показываем:
      // оглушение важнее отдыха, иначе таймер обещал бы строй раньше срока.
      const ms = new Date(busy.until).getTime();
      if (ms < soonestMs) {
        soonestMs = ms;
        agg.soonest = ch;
      }
    }
    m.set(keyOf(c.templateId, c.level), agg);
  }
  return m;
}

/**
 * Функция «что мешает этой фишке» для поля отряда. Один проход по инвентарю на
 * рендер, а не по проходу на слот.
 */
export function useSlotBusy(
  chips: InvChip[],
  nowTick: number,
  t: TFn,
): (l: SquadLine) => SlotBusyView | null {
  const maps = useMemo(() => {
    const bySerial = new Map<string, ChipBusyView>();
    for (const c of chips)
      for (const ch of c.chips ?? []) {
        if (ch.serialNo == null) continue;
        const view = chipBusyView(ch, nowTick, t);
        if (view) bySerial.set(`${keyOf(c.templateId, c.level)}|${ch.serialNo}`, view);
      }
    return { bySerial, byTemplate: aggregate(chips, nowTick) };
    // t меняется вместе с языком — подписи в слотах должны переезжать с ним.
  }, [chips, nowTick, t]);

  return (l: SquadLine): SlotBusyView | null => {
    const key = keyOf(l.templateId, l.level);
    if (l.serialNo != null) return maps.bySerial.get(`${key}|${l.serialNo}`) ?? null;
    const agg = maps.byTemplate.get(key);
    if (!agg || agg.busy === 0) return null;
    // Свободных таких не осталось — значит и эта запись в бой не выйдет.
    if (agg.busy >= agg.total) return chipBusyView(agg.soonest, nowTick, t);
    return { kind: "partial", left: t("squad.busy_some"), hint: t("squad.busy_some_hint") };
  };
}
