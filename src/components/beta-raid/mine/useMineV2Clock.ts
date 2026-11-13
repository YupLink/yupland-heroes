// Часы окна шахты: раз в секунду пересчитывают добычу, запас и остаток до
// поломки. Шахта v2 сломалась — окно сразу показывает «сломана» и перечитывает
// данные (флажок, «Добыча», окно), не дожидаясь минутного обхода сервера.
//
// Время — по часам СЕРВЕРА (lib/mineV2Clock): телефон с часами, ушедшими
// вперёд, «ломал» свою работающую шахту раньше срока и прятал «Собрать».
import { useEffect, useRef, useState } from "react";
import { mineBrokenNow, mineServerNow, type MineV2Stamped } from "@/lib/mineV2Clock";
import { useMineInvalidate } from "./useMineInvalidate";

/** Текущее время, обновляется раз в секунду, пока active. */
export function useSecondTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return active ? now : Date.now();
}

/** Повторный перечит, пока сервер ещё не видит поломки (сдвиг меряется с точностью до запроса). */
const RECHECK_MS = 3000;

export function useMineV2Clock(
  q: number,
  r: number,
  v2: MineV2Stamped | null,
): { now: number; broken: boolean } {
  // now — часы сервера: с ним сравниваются breakAt/lifeAt и секундомер добычи.
  const now = mineServerNow(v2, useSecondTick(!!v2 && !v2.broken));
  const broken = !!v2 && mineBrokenNow(v2, now);
  const invalidate = useMineInvalidate(q, r);
  const fired = useRef(false);
  useEffect(() => {
    // Починили — следующая поломка снова перечитает окно сразу.
    if (!broken) {
      fired.current = false;
      return;
    }
    if (!v2 || v2.broken) return;
    // Срок вышел, а снимок ещё «работает»: перечитать сразу, а если и новый
    // ответ опередил поломку на долю секунды — ещё раз чуть позже.
    const id = setTimeout(invalidate, fired.current ? RECHECK_MS : 0);
    fired.current = true;
    return () => clearTimeout(id);
  }, [broken, v2, invalidate]);
  return { now, broken };
}
