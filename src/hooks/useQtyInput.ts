// Поле количества: ввод хранится строкой, число зажимается на выходе из поля
// и при нажатии кнопки действия. Правило — в @/lib/qtyPick, здесь только
// состояние. Общее для окон выброса, склада и сумки зелий.
import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { cleanNumText } from "@/components/beta-raid/market/num";
import { clampQty, commitQty, qtyBounds, qtyText, stepQty } from "@/lib/qtyPick";

export function useQtyInput(opts: {
  /** Сколько есть: выше не поднять. */
  max: number;
  /** С чего начать. */
  initial: number;
  /** Только целые штуки. */
  integer?: boolean;
  /** Быстрые доли окна («Ячейку», «Всё»). */
  presets?: readonly number[];
}) {
  const lang = useLang();
  const b = qtyBounds(opts.max, opts);
  const [value, setValue] = useState(opts.initial);
  // null — поле не правят: показываем число. Строка — то, что набрано сейчас.
  const [draft, setDraft] = useState<string | null>(null);
  // Зажим и при чтении: стек мог похудеть, пока окно открыто.
  const current = draft == null ? clampQty(value, b) : commitQty(draft, value, b, lang);
  const put = (n: number): number => {
    setValue(n);
    setDraft(null);
    return n;
  };
  return {
    /** Сколько уйдёт, если нажать кнопку сейчас. */
    value: current,
    /** Текст поля. */
    text: draft ?? qtyText(current, lang),
    integer: b.integer,
    type: (raw: string) => setDraft(cleanNumText(raw, { integer: b.integer })),
    /** Зафиксировать набранное (выход из поля, кнопка) — вернёт итоговое число. */
    commit: () => put(current),
    step: (dir: 1 | -1) => put(stepQty(current, dir, b)),
    set: (n: number) => put(clampQty(n, b)),
    fmt: (n: number) => qtyText(n, lang),
  };
}

export type QtyInput = ReturnType<typeof useQtyInput>;
