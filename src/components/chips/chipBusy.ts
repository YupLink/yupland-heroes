// Занятость фишки в одном месте: оглушение боссом (chip_effects) и час отдыха
// после передачи/покупки/ввода NFT. Раньше каждый экран считал это сам, и
// считал по-разному: инвентарь знал только про отдых, поэтому выбитая боссом
// фишка выглядела там боеспособной, а игрок узнавал о потере уже в бою.
//
// Формат таймера тоже общий: «1 ч 12 мин» в инвентаре и в замке должны
// совпадать до минуты, иначе два экрана спорят о том, когда фишка встанет.

import { useEffect, useState } from "react";

/** Почему фишка не в строю. Разные состояния — разные подписи и цвета. */
export type ChipBusyKind = "stun" | "rest" | "study";

/** Минимум, который нужен от экземпляра фишки, чтобы понять её состояние. */
export type ChipBusyInstance = {
  restUntil?: string | null;
  stunUntil?: string | null;
  /** Учится в университете: срока нет — стоит, пока игрок не заберёт. */
  studying?: boolean;
};

export type ChipBusy = { kind: ChipBusyKind; until: string | null };

/** Готовая к показу занятость: строку времени считает тот, у кого есть t и тик. */
export type ChipBusyView = { kind: ChipBusyKind; left: string; hint: string };

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Ключи подписей — рядом с состоянием, чтобы экраны не расходились в словах. */
export const CHIP_BUSY_IN: Record<ChipBusyKind, string> = {
  stun: "chips.busy_stun_in",
  rest: "chips.busy_rest_in",
  study: "chips.busy_study_in",
};
export const CHIP_BUSY_HINT: Record<ChipBusyKind, string> = {
  stun: "chips.busy_stun_hint",
  rest: "chips.busy_rest_hint",
  study: "chips.busy_study_hint",
};

/**
 * Срок ещё не вышел. nowTick === 0 — это SSR: до гидрации ничего не гасим,
 * иначе сервер и клиент нарисуют разное и гидрация развалится.
 */
export function chipBusyUntil(until: string | null | undefined, nowTick: number): boolean {
  return !!until && nowTick > 0 && new Date(until).getTime() > nowTick;
}

/**
 * Что именно мешает фишке драться. Оглушение важнее отдыха: отдых пройдёт сам
 * через час, а оглушение — единственное, из-за чего фишка «без сознания», и
 * показывать надо его.
 */
export function chipBusyOf(
  c: ChipBusyInstance | null | undefined,
  nowTick: number,
): ChipBusy | null {
  // Обучение важнее прочего: у отдыха и оглушения срок кончится сам, а из
  // университета фишку забирают руками — и до тех пор она недоступна.
  if (c?.studying) return { kind: "study", until: null };
  const stun = c?.stunUntil ?? null;
  if (stun && chipBusyUntil(stun, nowTick)) return { kind: "stun", until: stun };
  const rest = c?.restUntil ?? null;
  if (rest && chipBusyUntil(rest, nowTick)) return { kind: "rest", until: rest };
  return null;
}

/**
 * Тик времени. Десять секунд, а не минута: оглушение отпускает само, и игрок
 * не должен перезагружать страницу, чтобы фишка снова стала боеспособной.
 */
/** «1 ч 12 мин» / «45 мин» — один формат на инвентарь, замок и бой. */
export function fmtBusyLeft(until: string | null | undefined, nowTick: number, t: TFn): string {
  if (!until) return "";
  const ms = new Date(until).getTime() - nowTick;
  if (ms <= 0) return "";
  const m = Math.ceil(ms / 60000);
  return m >= 60
    ? t("chips.busy_hm", { h: Math.floor(m / 60), m: m % 60 })
    : t("chips.busy_m", { m });
}

/** Занятость в виде, готовом к показу: время уже посчитано и локализовано. */
export function chipBusyView(
  c: ChipBusyInstance | null | undefined,
  nowTick: number,
  t: TFn,
): ChipBusyView | null {
  const busy = chipBusyOf(c, nowTick);
  if (!busy) return null;
  // У обучения срока нет — подпись без времени.
  if (busy.kind === "study") {
    return { kind: "study", left: "", hint: t(CHIP_BUSY_HINT.study) };
  }
  const left = fmtBusyLeft(busy.until, nowTick, t);
  return { kind: busy.kind, left, hint: t(CHIP_BUSY_IN[busy.kind], { time: left }) };
}

/**
 * Общий тик для таймеров занятости: один интервал на экран, а не по одному на
 * карточку. Возвращает 0 на SSR — до гидрации ничего не гасим.
 */
export function useNowTick(intervalMs = 10000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
