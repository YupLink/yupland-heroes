// Один товар — один ключ. Канон вида предмета.
//
// Ключ стека в рюкзаке — `kind:ref`, где ref это шаблон справочника (cst_*,
// hero_*, rbt_*, cp_*). Но у позиции маркета шаблон можно не задать, и тогда
// ключом становился id САМОЙ ПОЗИЦИИ (mkt_*). Так «Помидор» с одной витрины и
// «Помидоры» из справочника стали разными предметами: две ячейки в рюкзаке,
// скупка одного не принимала другой, продать «не тот» помидор было нельзя.
//
// Здесь всё сводится к одному виду двумя ступенями:
//   1. явная связка в yuplink.item_alias — админ сказал «это то же самое»;
//   2. если ключ не из справочника (mkt_*), ищем шаблон с тем же именем —
//      «Помидор» и «Помидоры» сходятся по основе слова.
//
// Кэш держим в памяти на минуту: ключ вида нужен на каждый шаг по маркету,
// а справочник правят раз в неделю.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { MarketItem } from "@/lib/marketItem";

const TTL_MS = 60_000;

type AliasMap = Map<string, string>;
let cache: { at: number; map: AliasMap; names: Map<string, string> } | null = null;

/**
 * Основа слова для сравнения имён: регистр, ё/е и окончание множественного
 * числа не должны делать из одного товара два. «Помидоры» → «помидор»,
 * «Бананы» → «банан».
 */
export function nameStem(raw: string | null | undefined): string {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
  // Срезаем только «хвост» множественного числа и только у длинных слов:
  // у «мёд» и «мед» отрезать нечего, а «доска»/«доски» сойдутся.
  return s.replace(/(ы|и|а|я|ов|ей)$/u, (m, _p, off: number) => (off >= 4 ? "" : m));
}

async function load(): Promise<{ map: AliasMap; names: Map<string, string> }> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache;

  const rows = (await mcpExec(
    `SELECT kind, from_ref AS "fromRef", to_ref AS "toRef" FROM yuplink.item_alias;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ kind: string; fromRef: string; toRef: string }>;
  const map: AliasMap = new Map();
  for (const r of rows ?? []) map.set(`${r.kind}:${r.fromRef}`, r.toRef);

  // Справочник своих товаров: имя-основа → id шаблона. По нему подтягиваются
  // ключи-сироты, для которых явной связки никто не заводил. Порядок — по
  // дате создания: при двух шаблонах с одной основой («Доска»/«Доски»)
  // побеждает старший, тот же, что раньше выбирала разборка корабля.
  const tpl = (await mcpExec(
    `SELECT id, name FROM yuplink.raid_custom_item ORDER BY created_at, id;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ id: string; name: string }>;
  const names = new Map<string, string>();
  for (const t of tpl ?? []) {
    const stem = nameStem(t.name);
    if (stem && !names.has(stem)) names.set(stem, t.id);
  }

  cache = { at: now, map, names };
  return cache;
}

/** Сбросить кэш — зовётся, когда админ правит связки или справочник. */
export function invalidateAliases(): void {
  cache = null;
}

/**
 * Канонический ключ вида. `name` нужен для ключей-сирот (mkt_*) и для
 * товара БЕЗ ref вовсе: по имени находим шаблон справочника. Ничего не
 * нашли — возвращаем как есть.
 */
export async function canonRef(
  kind: string,
  ref: string | null | undefined,
  name?: string | null,
): Promise<string | null> {
  const raw = (ref ?? "").trim();
  const { map, names } = await load();

  // Явная связка сильнее всего: админ мог свести и два шаблона справочника.
  const direct = raw ? map.get(`${kind}:${raw}`) : undefined;
  if (direct) return direct;

  // Ключ-сирота от позиции маркета ИЛИ пустой ref — ищем шаблон с тем же
  // именем. Пустой ref раньше выходил отсюда сразу: так «Доска» с разборки
  // корабля (refId=null) и со склада ложилась в ключ 'custom:' — без картинки,
  // не стакалась с досками из маркета и не продавалась (скупка ищет канон).
  if (kind === "custom" && name && (!raw || raw.startsWith("mkt_"))) {
    const byName = names.get(nameStem(name));
    // Найденный по имени шаблон тоже может быть сведён связкой (владелец
    // пересоздал «Доску» и связал старую с новой) — доводим до конца.
    if (byName) return map.get(`${kind}:${byName}`) ?? byName;
  }
  return raw || (ref ?? null);
}

/** Хвост ключа стека — ref вида: 'custom:mkt_x' → 'mkt_x', 'custom:' → null. */
export function refFromStackKey(stackKey: string): string | null {
  const i = stackKey.indexOf(":");
  const tail = i < 0 ? "" : stackKey.slice(i + 1).trim();
  return tail || null;
}

/** Минимум, по которому рюкзак находит ячейку товара. */
export type StackItem = Pick<MarketItem, "kind" | "refId" | "name"> & { id?: string | null };

/**
 * Ключ стека товара: разные виды — разные ячейки.
 *
 * Асинхронный, потому что вид приводится к КАНОНУ: «Помидор» с витрины без
 * шаблона и «Помидоры» из справочника — один товар и одна ячейка. Синхронную
 * версию не держим специально: два разных ключа для одного вида и были той
 * самой ошибкой.
 *
 * Ключ с пустым хвостом ('custom:') — товар без вида: такой стек не продать,
 * не сложить с нормальным и не отрисовать. Раньше он молча ложился в рюкзак
 * (три формы «Доски» на проде); теперь это отказ — вызывающие откатывают
 * выдачу (судно и энергия возвращаются, полка склада не пустеет).
 */
export async function stackKeyFor(item: StackItem): Promise<string> {
  const key = await canonStackKey(item.kind, item.refId ?? item.id, item.name);
  if (!refFromStackKey(key)) throw new Error("market.bad_item");
  return key;
}

/** Готовый ключ стека с каноном внутри: единственная дверь к stack_key. */
export async function canonStackKey(
  kind: string,
  ref: string | null | undefined,
  name?: string | null,
): Promise<string> {
  const canon = await canonRef(kind, ref, name);
  return `${kind}:${canon ?? ref ?? ""}`;
}

/** Все ключи, которые исторически означали тот же вид (для чтения остатков). */
export async function aliasesOf(kind: string, canon: string): Promise<string[]> {
  const { map } = await load();
  const out = [canon];
  for (const [key, to] of map) {
    if (to !== canon) continue;
    const [k, from] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    if (k === kind) out.push(from);
  }
  return out;
}

/**
 * Имя и картинка КАНОНА своего товара. Нужны выдаче: подпись стека берётся у
 * шаблона, а не у позиции витрины — иначе один и тот же банан лежит то
 * «Бананом», то «Бананами», смотря с какой витрины пришёл.
 */
export async function canonCustomMeta(
  ref: string | null | undefined,
): Promise<{ name: string; image: string | null } | null> {
  const id = (ref ?? "").trim();
  if (!id.startsWith("cst_")) return null;
  const rows = (await mcpExec(
    `SELECT name, image FROM yuplink.raid_custom_item WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ name: string; image: string | null }>;
  const row = rows?.[0];
  return row ? { name: String(row.name ?? ""), image: row.image ?? null } : null;
}
