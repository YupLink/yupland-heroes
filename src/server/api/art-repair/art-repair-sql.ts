// Ремонт артефактов (ПРАВИЛА §8.72): текст запросов и разбор ответа функции базы
// yuplink.art_repair (migrations/art-repair-01.sql). Текстом — чтобы тот же
// вызов проверялся тестом и на живой базе с ROLLBACK.
import { sqlStr } from "@/server/api/raid-shared";
import { artDurability } from "@/lib/hero/artWear";
import {
  ART_REPAIR_PRICE,
  artRepairPrice,
  repairRarity,
  type ArtRepairDone,
  type ArtRepairItem,
} from "@/lib/hero/artRepair";

/** Больше строк окну не нужно: изнашиваются только надетые, их десятки. */
export const REPAIR_LIST_LIMIT = 500;

/**
 * Изношенные артефакты АККАУНТА: в инвентаре и надетые на его героев. Залог
 * рынка героев живёт на счёте '_hero_market' — сюда не попадает. «На ком» —
 * герой этого аккаунта, у которого предмет в equipped (основной — первым).
 */
export function repairListSql(account: string): string {
  const a = sqlStr(account);
  return `WITH eq AS (
       SELECT DISTINCT ON (e.value) e.value AS item_id, ht.name AS hero_name
         FROM yuplink.hero_instance h
         JOIN yuplink.mystic_item_template ht ON ht.id = h.template_id,
              jsonb_each_text(CASE WHEN jsonb_typeof(h.equipped::jsonb) = 'object'
                                   THEN h.equipped::jsonb ELSE '{}'::jsonb END) e
        WHERE h.account_id = ${a}
        ORDER BY e.value, h.selected_at DESC NULLS LAST, h.id
     )
     SELECT u.id, u.wear, t.name, t.image_url, t.rarity, eq.hero_name
       FROM yuplink.user_game_item u
       JOIN yuplink.mystic_item_template t ON t.id = u.template_id
       LEFT JOIN eq ON eq.item_id = u.id
      WHERE u.account_id = ${a} AND u.kind = 'artifact' AND u.wear > 0
      ORDER BY u.wear DESC, t.name, u.id
      LIMIT ${REPAIR_LIST_LIMIT}`;
}

export type RepairListRow = {
  id: string;
  wear: unknown;
  name: string | null;
  image_url: string | null;
  rarity: string | null;
  hero_name: string | null;
};

/** Строка базы → строка окна (цена — из той же таблицы, что у базы). */
export function repairItemOf(row: RepairListRow): ArtRepairItem {
  return {
    id: String(row.id),
    name: row.name ?? "",
    imageUrl: row.image_url ?? null,
    rarity: repairRarity(row.rarity),
    durability: artDurability(row.wear),
    heroName: row.hero_name ?? null,
    price: artRepairPrice(row.rarity),
  };
}

/** Вызов функции ремонта: цены — с сервера, сумма — в базе по редкостям строк. */
export function repairCallSql(o: {
  op: string;
  account: string;
  ids: string[];
  all: boolean;
  expectGold: number;
  expectDiamonds: number;
}): string {
  const ids = o.ids.length ? `ARRAY[${o.ids.map(sqlStr).join(", ")}]::text[]` : "'{}'::text[]";
  const prices = sqlStr(JSON.stringify(ART_REPAIR_PRICE));
  return `SELECT yuplink.art_repair(${sqlStr(o.op)}, ${sqlStr(o.account)}, ${ids},
    ${o.all ? "true" : "false"}, ${prices}::jsonb, ${o.expectGold}, ${o.expectDiamonds}) AS r`;
}

/** Ответ функции: итог или отказ по существу (error + подстановки). */
export type RepairResult = {
  ok: boolean;
  fresh?: boolean;
  error?: string;
  [k: string]: unknown;
};

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Итог для клиента (без остатков — их перечитывает useResources). */
export function repairDoneOf(r: RepairResult): ArtRepairDone {
  return {
    ok: true,
    fresh: r.fresh !== false,
    count: num(r.count),
    gold: num(r.gold),
    diamonds: num(r.diamonds),
    ids: Array.isArray(r.ids) ? r.ids.map(String) : [],
  };
}

/**
 * Отказ по существу → ключ словаря (с числами — «ключ|{json}», как humanError).
 * Нехватка: какого ресурса не хватает — тот и называем, нужно/есть.
 */
export function repairRefusal(r: RepairResult): string {
  if (r.error === "short") {
    const gold = { need: num(r.needGold), have: Math.floor(num(r.haveGold)) };
    const dia = { need: num(r.needDiamonds), have: Math.floor(num(r.haveDiamonds)) };
    const g = gold.need > num(r.haveGold);
    const d = dia.need > num(r.haveDiamonds);
    if (g && d)
      return `artfix.short_both|${JSON.stringify({ g: gold.need, gh: gold.have, d: dia.need, dh: dia.have })}`;
    return d
      ? `artfix.short_diamonds|${JSON.stringify(dia)}`
      : `artfix.short_gold|${JSON.stringify(gold)}`;
  }
  if (r.error === "bad_item") return r.why === "not_worn" ? "artfix.not_worn" : "artfix.not_yours";
  if (r.error === "price_moved") return "artfix.price_moved";
  if (r.error === "empty") return "artfix.nothing";
  return "artfix.failed";
}

/**
 * Исключение базы → ключ. Нехватка у res_move — гонка после сверки баланса;
 * замок/взаимная блокировка — «нажми ещё раз». В транзакции откатилось всё.
 */
export function repairDbError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  if (/res_move: в минус/.test(raw)) return "artfix.short";
  if (/lock timeout|deadlock|could not obtain lock|canceling statement/i.test(raw))
    return "artfix.busy";
  return "artfix.failed";
}
