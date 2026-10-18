// Что лопата в руках может сделать с клеткой, по которой тапнули (ПРАВИЛА
// §8.24): «Копать» пустую землю, «Закопать» мешочек или сундук, «Выкопать»
// бугорок. Тап кладёт предложение сюда, а плашка маршрута показывает его ещё
// одной кнопкой — без новых пропсов через экран и канвас рейда (оба за лимитом
// строк). Предложение одно на экран: следующий тап его заменяет.
import { useSyncExternalStore } from "react";

export type ShovelAct = "dig" | "bury" | "unbury";

/**
 * Клетка и дело; near — вплотную (кнопка делает сразу, за 2 энергии); here —
 * копать под собой: плашка без маршрута, только кнопка.
 */
export type ShovelOffer = { q: number; r: number; act: ShovelAct; near: boolean; here: boolean };

/** Надпись дела — ключ словаря. */
export const SHOVEL_LABEL: Record<ShovelAct, string> = {
  dig: "dig.act",
  bury: "bag.bury",
  unbury: "bag.dig",
};

/**
 * Кто выполняет (useShovel): go — кнопка плашки (true — сделано на месте, плашку
 * закрыть), arrive — пришли маршрутом «дойти и копать» (useApproachDone).
 */
type Runner = { go: (o: ShovelOffer) => boolean; arrive: (at: { q: number; r: number }) => void };

let offer: ShovelOffer | null = null;
let runner: Runner | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();

export const shovelOffer = {
  get: (): ShovelOffer | null => offer,
  set(next: ShovelOffer | null): void {
    if (next === offer) return;
    if (timer) clearTimeout(timer);
    timer = null;
    offer = next;
    // Плашка «копать под собой» гаснет сама через 5 с — как маршрут.
    if (next?.here) timer = setTimeout(() => shovelOffer.set(null), 5000);
    for (const f of subs) f();
  },
  subscribe(f: () => void): () => void {
    subs.add(f);
    return () => void subs.delete(f);
  },
  setRunner(fn: Runner | null): void {
    runner = fn;
  },
  /** Кнопка плашки: рядом — сделать сразу (true), далеко — маршрут с этим делом. */
  go(): boolean {
    return offer && runner ? runner.go(offer) : false;
  },
  /** Маршрут «<дело> · N шагов» пройден: дело — по тому, что на клетке сейчас. */
  arrive(at: { q: number; r: number }): void {
    runner?.arrive(at);
  },
};

/**
 * Текущее предложение лопаты — для плашки маршрута. Снимок «сервера» тот же:
 * предложение кладут только обработчики тапа в браузере, на сервере его нет.
 */
export function useShovelOffer(): ShovelOffer | null {
  return useSyncExternalStore(shovelOffer.subscribe, shovelOffer.get, shovelOffer.get);
}
