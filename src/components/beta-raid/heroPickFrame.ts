// Рамка в списке героев, пока игрок меняет основного (замок и окно с карты).
//
// Тап не меняет героя сразу — дальше «Подтвердить». Рамка ждала ответа
// сервера и оставалась на прежнем, будто тап не прошёл (жалоба 27.09.2026).
// Теперь она сразу переезжает на тапнутого, галочка остаётся на основном, а
// после подтверждения обе стоят на новом.
import type { QueryClient } from "@tanstack/react-query";

/** Как герой опознаётся в списке: у спящего (лежит предметом) id ещё нет. */
export type HeroRef = { id: string | null; itemId?: string | null; templateId: string };

const keyOf = (h: HeroRef): string => h.id ?? h.itemId ?? h.templateId;

/**
 * Основной ли это герой. Пустой id не совпадает ни с кем: без основного
 * `null === null` отмечал бы галочкой всех спящих разом, а тап по спящему
 * считался бы тапом по основному и ничего не выбирал.
 */
export const isCurrentHero = (h: HeroRef, currentId: string | null | undefined): boolean =>
  !!currentId && h.id === currentId;

/** Рамка: на тапнутом, пока ждём подтверждения, иначе — на основном. */
export const isFramedHero = (
  h: HeroRef,
  pending: HeroRef | null,
  currentId: string | null | undefined,
): boolean => (pending ? keyOf(h) === keyOf(pending) : isCurrentHero(h, currentId));

/**
 * Смена прошла — дождаться свежих списка и основного, прежде чем снимать
 * «тапнутого». Иначе рамка на миг прыгала на прежнего героя (кэш ещё старый),
 * а у разбуженного спящего id появляется только в новом списке. Запросы уже
 * запущены invalidateHeroQueries: cancelRefetch=false ждёт их, не дублируя.
 */
export function heroPickSettled(qc: QueryClient): Promise<unknown> {
  return Promise.all(
    ["my-heroes", "my-selected-hero"].map((key) =>
      qc.refetchQueries({ queryKey: [key] }, { cancelRefetch: false }),
    ),
  );
}
