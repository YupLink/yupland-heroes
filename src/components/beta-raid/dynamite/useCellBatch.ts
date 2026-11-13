// Несколько клеток одним нажатием (владелец, 26.10.2026: «натыкал 20 штук и
// нажал „положить“»): выбор клеток окна и запуск подряд — бросок динамита,
// укладка земли. Сервер не меняется: каждая клетка — своё обычное действие со
// своим ключом нажатия. Ключ клетки живёт до ответа: удача или отказ сервера —
// новый в следующий раз; обрыв связи — тот же, и повтор той клетки второй раз не
// возьмёт ни штуки, ни энергии. Первая ошибка останавливает остальные клетки.
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { newOpId } from "@/lib/opId";

type Hex = { q: number; r: number };
type Pickable = { dq: number; dr: number; ok: boolean; reason: string | null };

/** Отказ сервера ключом словаря («land.taken», «mineplace.no_energy|{…}») — не обрыв. */
export const isRefusal = (e: Error): boolean =>
  /^[a-z][a-z0-9]*\.[a-z0-9_]+(\||$)/i.test(e.message);

const same = (a: { dq: number; dr: number }) => (b: { dq: number; dr: number }) =>
  a.dq === b.dq && a.dr === b.dr;

/** Выбор клеток: тап по зелёной — добавить/снять, по красной — почему нельзя. */
export function usePickedCells<C extends Pickable>(list: readonly C[] | null, max: number) {
  const [picked, setPicked] = useState<C[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  // Подсветку перечитали (положили, герой шагнул) — выбор сверяем заново.
  useEffect(() => {
    if (!list) return;
    setPicked((prev) => {
      const next = prev.flatMap((p) => {
        const now = list.find(same(p));
        return now?.ok ? [now] : [];
      });
      return next.length === prev.length && next.every((c, i) => c === prev[i]) ? prev : next;
    });
  }, [list]);
  const pick = (c: C) => {
    if (!c.ok) {
      setWhy(c.reason);
      return;
    }
    if (!picked.some(same(c)) && picked.length >= max) {
      setWhy("pick.max");
      return;
    }
    setWhy(null);
    setPicked((prev) => (prev.some(same(c)) ? prev.filter((p) => !same(c)(p)) : [...prev, c]));
  };
  return { picked, why, pick, clear: () => setPicked([]) };
}

export type BatchEnd<R> = { results: R[]; all: number; error: Error | null };

/** Запуск подряд: run на клетку; onEach — после каждой удачи; onEnd — итог. */
export function useCellBatch<R>(o: {
  run: (at: Hex, op: string) => Promise<R>;
  onEach?: (res: R) => void;
  onEnd: (end: BatchEnd<R>) => void;
}) {
  const ops = useRef(new Map<string, string>());
  const [done, setDone] = useState(0);
  const batch = useMutation({
    mutationFn: async (targets: Hex[]): Promise<BatchEnd<R>> => {
      const results: R[] = [];
      setDone(0);
      for (const at of targets) {
        const k = `${at.q},${at.r}`;
        const op = ops.current.get(k) ?? newOpId();
        ops.current.set(k, op);
        try {
          const res = await o.run(at, op);
          ops.current.delete(k);
          results.push(res);
          setDone(results.length);
          o.onEach?.(res);
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          if (isRefusal(error)) ops.current.delete(k);
          return { results, all: targets.length, error };
        }
      }
      return { results, all: targets.length, error: null };
    },
    onSuccess: (end) => o.onEnd(end),
  });
  return { start: (targets: Hex[]) => batch.mutate(targets), busy: batch.isPending, done };
}
