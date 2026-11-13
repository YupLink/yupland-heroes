// Артефакты из лаборатории (§8.81) — одна вещь на свете у того, кто её создал.
// Случайные выдачи (лавки «любой артефакт редкости», турниры, раскладка по
// карте, призы боссов, дроп острова), публичный архив картинок и плата
// артефактами их не берут: шаблон помечен meta.crafted = 'ai'.
import { MOUNT_SLOT } from "@/lib/hero/mount";

/** Условие «не из лаборатории» для выборок шаблонов (алиас таблицы — по месту). */
export const notCrafted = (alias = "") =>
  `coalesce(${alias ? `${alias}.` : ""}meta->>'crafted', '') = ''`;

/**
 * Можно выдавать другим и платить им (владелец, 08.11.2026; §8.122): обычный
 * шаблон ИЛИ МАССОВЫЙ арт генератора — «другой может также где-то получить
 * этот арт, в сундуке и т. д.». Уникальный арт генератора и арт лаборатории —
 * никогда: одна вещь на свете.
 */
export const droppable = (alias = "") => {
  const p = alias ? `${alias}.` : "";
  return `(${notCrafted(alias)} OR (${p}meta->>'crafted' = 'gen' AND coalesce(${p}meta->>'unique', '') <> 'true'))`;
};

/**
 * Не конь (§8.84): случайные выдачи и «любой артефакт редкости» коней не берут — конь
 * продаётся и скупается только позицией своего шаблона.
 */
export const notMount = (alias = "") =>
  `coalesce(${alias ? `${alias}.` : ""}slot, '') <> '${MOUNT_SLOT}'`;

/** То же для строк, уже прочитанных из базы (meta — объект или JSON-строка). */
export function isCraftedMeta(meta: unknown): boolean {
  const m = typeof meta === "string" ? safeJson(meta) : meta;
  return !!m && typeof m === "object" && !!(m as { crafted?: unknown }).crafted;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
