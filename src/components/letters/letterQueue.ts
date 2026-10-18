// Очередь писем на весь экран — чистая логика окна (без React).
//
// Пришло несколько писем — показываем по одному, по порядку сервера (старые
// первыми). «Понятно» убирает письмо сразу, не дожидаясь ответа сервера: окно
// не должно висеть на сети. Убранное не возвращается, даже если повторная
// загрузка (вернулся во вкладку) принесёт его снова, пока отметка в пути.
import type { PlayerLetter } from "@/lib/letters";

export type LetterQueueView = {
  /** Письмо на экране; null — показывать нечего. */
  current: PlayerLetter | null;
  /** Номер текущего письма среди пришедших (с 1). */
  position: number;
  /** Сколько писем пришло за этот вход. */
  total: number;
};

/** Без повторов по id: одно письмо — одно окно. */
export function uniqueLetters(letters: readonly PlayerLetter[]): PlayerLetter[] {
  const seen = new Set<string>();
  return letters.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
}

export function letterQueue(
  letters: readonly PlayerLetter[],
  done: ReadonlySet<string>,
): LetterQueueView {
  const all = uniqueLetters(letters);
  const left = all.filter((l) => !done.has(l.id));
  const current = left[0] ?? null;
  return {
    current,
    position: current ? all.length - left.length + 1 : 0,
    total: all.length,
  };
}

/** «Понятно»: новое множество убранных (старое не мутируем — это стейт React). */
export function withDone(done: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (done.has(id)) return done;
  const next = new Set(done);
  next.add(id);
  return next;
}

/**
 * Свежий ответ сервера поверх показанного. Окно открыто — уже пришедшие письма
 * остаются на своих местах, новые встают в конец (номер «2 из 3» не прыгает).
 * Окно закрыто — счёт с нуля, без убранных: новое письмо — «1 из 1».
 */
export function nextLetters(
  shown: readonly PlayerLetter[],
  fresh: readonly PlayerLetter[],
  done: ReadonlySet<string>,
): PlayerLetter[] {
  if (!letterQueue(shown, done).current) return uniqueLetters(fresh.filter((l) => !done.has(l.id)));
  const known = new Set(shown.map((l) => l.id));
  return uniqueLetters([...shown, ...fresh.filter((l) => !known.has(l.id))]);
}
