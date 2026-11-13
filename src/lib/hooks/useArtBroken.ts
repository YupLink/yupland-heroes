// Механика поломки артефактов на клиенте (ПРАВИЛА §8.63 п.3): запущена ли она
// для этого игрока и очередь плашек «Сломан: <имя>» над героем.
//
// Флаг — один кэш на приложение: накладку рисует каждая сломанная картинка, и
// запрос уходит один раз (минутная свежесть; запуск — строка в базе, без выката).
// Плашки приходят в ответе удара (takeArtBreaks) и с сервера при входе на карту.
import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  ART_BREAK_TOAST_MS,
  artLockedPct,
  mergeArtBreakNotes,
  type ArtBreakNote,
} from "@/lib/hero/artBroken";
import { invalidateHeroQueries } from "@/lib/query";
import {
  getArtBreakNotices,
  getArtBrokenOn,
  markArtBreakShown,
} from "@/server/api/art-repair/art-broken";

export const ART_BROKEN_ON_KEY = ["art-broken-on"] as const;
export const ART_BREAK_NOTICES_KEY = ["art-break-notices"] as const;

export type ArtBreakQueue = { items: ArtBreakNote[] };

/** Механика запущена: флаг запуска или админ. Пока не знаем — нет. */
export function useArtBrokenOn(): boolean {
  const q = useQuery({
    queryKey: ART_BROKEN_ON_KEY,
    queryFn: () => getArtBrokenOn(),
    staleTime: 60_000,
  });
  return q.data?.on === true;
}

/** «Надеть нельзя» по прочности из ответа: сломан и механика запущена. */
export function useArtLocked(): (durability: number | null | undefined) => boolean {
  const on = useArtBrokenOn();
  return (durability) => artLockedPct(durability, on);
}

/** Непоказанные плашки; грузим, только когда механика запущена. */
export function useArtBreakQueue(on: boolean) {
  return useQuery({
    queryKey: ART_BREAK_NOTICES_KEY,
    queryFn: (): Promise<ArtBreakQueue> => getArtBreakNotices(),
    enabled: on,
    staleTime: 60_000,
  });
}

/**
 * Удар вернул поломки: плашки — в очередь сразу (без запроса), а всё, что
 * зависит от надетого, — перечитать: артефакт слетел с героя в инвентарь.
 */
export function takeArtBreaks(qc: QueryClient, notes: readonly ArtBreakNote[] | undefined): void {
  if (!notes || notes.length === 0) return;
  qc.setQueryData<ArtBreakQueue>(ART_BREAK_NOTICES_KEY, (old) => ({
    items: mergeArtBreakNotes(old?.items, notes),
  }));
  invalidateHeroQueries(qc);
}

/**
 * После боя охранника: износ — у открытых окон снаряжения и инвентаря, поломки —
 * в очередь плашек (и полный перечит героя, если что-то слетело).
 */
export function afterArtWear(qc: QueryClient, notes: readonly ArtBreakNote[] | undefined): void {
  for (const k of ["my-hero-gear", "my-game-items"]) void qc.invalidateQueries({ queryKey: [k] });
  takeArtBreaks(qc, notes);
}

/** Сколько плашек видно разом; остальные ждут своей очереди. */
export const ART_BREAK_VISIBLE = 3;

/**
 * Показанные в этой вкладке: перечитанная очередь, пришедшая с сервера раньше
 * пометки «показано», не вернёт плашку второй раз.
 */
const SHOWN = new Set<string>();

/** Что видно сейчас: непоказанные, по очереди, не больше трёх. */
export function visibleArtBreaks(items: readonly ArtBreakNote[] | undefined): ArtBreakNote[] {
  return (items ?? []).filter((n) => !SHOWN.has(n.id)).slice(0, ART_BREAK_VISIBLE);
}

/** Таймер плашки: через 5 секунд — «показано». Возвращает отмену. */
export function scheduleArtBreak(id: string, onDone: (id: string) => void): () => void {
  const t = setTimeout(() => onDone(id), ART_BREAK_TOAST_MS);
  return () => clearTimeout(t);
}

/**
 * Плашка ушла: из очереди сразу, на сервере — «показано» (после перезагрузки
 * не всплывёт). Сбой пометки не страшен — в худшем случае плашка всплывёт ещё раз.
 */
export function finishArtBreak(
  qc: QueryClient,
  id: string,
  mark: (ids: string[]) => Promise<unknown> = (ids) => markArtBreakShown({ data: { ids } }),
): void {
  if (SHOWN.has(id)) return;
  SHOWN.add(id);
  qc.setQueryData<ArtBreakQueue>(ART_BREAK_NOTICES_KEY, (old) =>
    old ? { items: old.items.filter((n) => n.id !== id) } : old,
  );
  void mark([id]).catch(() => undefined);
}
