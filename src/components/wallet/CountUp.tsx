// Лёгкий каунтап-счётчик для баланса. Анимирует число от 0 к целевому
// значению на rAF (без либ). Сохраняет дробную часть / формат строки —
// принимает уже отформатированную строку баланса и анимирует её число.

import { useEffect, useRef, useState } from "react";

/**
 * Анимирует появление числового значения. `value` — отформатированная
 * строка (например "12.3456"). Парсим число, гоним от 0 к нему за ~700мс,
 * сохраняя то же число знаков после запятой, что и в исходной строке.
 * Если строка не парсится в число — показываем как есть.
 */
export function CountUp({
  value,
  className,
  durationMs = 700,
}: {
  value: string;
  className?: string;
  durationMs?: number;
}) {
  const target = Number(value);
  const isNum = Number.isFinite(target);
  const decimals = value.includes(".") ? value.split(".")[1].length : 0;
  const [display, setDisplay] = useState(isNum ? "0" : value);
  const rafRef = useRef<number | null>(null);
  const lastTarget = useRef<number | null>(null);

  useEffect(() => {
    if (!isNum) {
      setDisplay(value);
      return;
    }
    // Анимируем только при смене целевого значения (включая первый показ).
    if (lastTarget.current === target) return;
    lastTarget.current = target;

    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = from + (target - from) * eased;
      setDisplay(cur.toFixed(decimals));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value); // финальное значение = исходная строка 1:1
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, target, isNum, decimals, durationMs]);

  return <span className={className}>{display}</span>;
}
