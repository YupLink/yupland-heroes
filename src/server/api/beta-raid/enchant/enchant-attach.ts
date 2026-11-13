// Зачарование экземпляров к уже готовому ответу (✦ «везде», владелец 28.10.2026):
// один запрос enchantPcts на весь список, без N+1. Сбой чтения ответ не роняет —
// строки уходят как были, просто без отметки. Поле добавляется ТОЛЬКО у
// зачарованных: форма ответа у остальных не меняется (старый клиент, тесты).
import { enchantPcts } from "./enchant-cards";

/** Проценты по id; сбой или мусор вместо числа — пусто, а не NaN в отметке. */
export async function safeEnchantPcts(ids: Array<string | null | undefined>): Promise<Map<string, number>> {
  const uniq = [...new Set(ids.filter((v): v is string => !!v))];
  if (!uniq.length) return new Map();
  const got = await enchantPcts(uniq).catch((e) => {
    console.warn("[enchant] зачарование списка не прочитано:", e);
    return new Map<string, number>();
  });
  return new Map([...got].filter(([, v]) => Number.isFinite(v)));
}

/** Строки списка + enchantPct у зачарованных (id экземпляра — idOf). */
export async function withEnchantPcts<T extends object>(
  rows: T[],
  idOf: (row: T) => string | null | undefined,
): Promise<Array<T & { enchantPct?: number }>> {
  const pcts = await safeEnchantPcts(rows.map(idOf));
  return rows.map((r) => {
    const pct = pcts.get(idOf(r) ?? "");
    return pct == null ? r : { ...r, enchantPct: pct };
  });
}
