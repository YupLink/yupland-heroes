// ШАБЛОНЫ заклинаний: что вообще есть в игре. Только чтение.
//
// Заклинание — это близкий родственник товара-буста: тот же список эффектов
// (BoostEffect[] из lib/hero/boost.ts), только даёт его не съеденное зелье, а
// откат и цена в энергии. Поэтому разбор эффектов здесь НЕ свой: один парсер
// на алтарь, товар и книгу — иначе «+2 к скорости» в трёх местах считалось бы
// тремя разными способами.
//
// Числа приводим прямо в SQL (::float8): numeric из моста приезжает и строкой,
// и числом, и молчаливая склейка "10" + 1 дала бы цену «101».
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { parseBoostEffects, type BoostEffect } from "@/lib/hero/boost";
import { spellCooldownMinutes, spellEnergyCost } from "@/lib/hero/spellPower";

/**
 * Вид заклинания. `boost` — обычное: вешает эффекты на героя. Остальные —
 * ТЕХНИЧЕСКИЕ: они двигают по карте корабль или самого героя (create_ship —
 * спускает новый, repair_ship — чинит), и эффекты у них могут быть пустыми.
 */
export const SPELL_KINDS = ["boost", "summon_ship", "teleport_town", "create_ship", "repair_ship"] as const;
export type SpellKind = (typeof SPELL_KINDS)[number];

export type SpellTpl = {
  id: string;
  name: string;
  description: string;
  image: string | null;
  /** Что вешает на героя. У технических может быть пусто. */
  effects: BoostEffect[];
  /** Полная цена в энергии, ДО скидки от интеллекта. */
  energyCost: number;
  /** Полный откат в минутах, ДО скидки от интеллекта. */
  cooldownMinutes: number;
  /** Ниже этого интеллекта заклинание не выучить и не прочесть (req_int). */
  minInt: number;
  kind: SpellKind;
  active: boolean;
};

type SpellSqlRow = {
  id: string;
  name: string | null;
  description: string | null;
  image: string | null;
  effects: unknown;
  energyCost: number | string | null;
  cooldownMinutes: number | string | null;
  minInt: number | string | null;
  kind: string | null;
  active: boolean | null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

/** Неизвестный вид — это обычное заклинание: колонка kind могла быть пустой. */
export function spellKindOf(raw: unknown): SpellKind {
  const s = String(raw ?? "").trim();
  return (SPELL_KINDS as readonly string[]).includes(s) ? (s as SpellKind) : "boost";
}

const toTpl = (row: SpellSqlRow): SpellTpl => ({
  id: row.id,
  name: row.name ?? "Заклинание",
  description: row.description ?? "",
  image: row.image ?? null,
  effects: parseBoostEffects(row.effects),
  energyCost: num(row.energyCost),
  cooldownMinutes: num(row.cooldownMinutes),
  minInt: num(row.minInt),
  kind: spellKindOf(row.kind),
  active: row.active !== false,
});

const COLUMNS = `id, name, description, image, effects,
       energy_cost::float8 AS "energyCost",
       cooldown_min::float8 AS "cooldownMinutes",
       req_int::float8 AS "minInt", kind, active`;

/**
 * Шаблоны заклинаний. Без `ids` — весь каталог; `activeOnly` по умолчанию
 * включён, потому что выключенное заклинание игроку не показывают и кастовать
 * не дают. Выученное, но выключенное админом, в книге всё равно видно (его
 * тянут по id) — просто с отказом на кнопке.
 */
export async function loadSpellTemplates(opts?: {
  ids?: string[];
  activeOnly?: boolean;
}): Promise<SpellTpl[]> {
  const ids = (opts?.ids ?? []).filter((s) => typeof s === "string" && s.trim());
  if (opts?.ids && ids.length === 0) return [];
  const where: string[] = [];
  if (ids.length > 0) where.push(`id IN (${ids.map(sqlStr).join(",")})`);
  if (opts?.activeOnly ?? true) where.push("active");
  const rows = (await mcpExec(
    `SELECT ${COLUMNS} FROM yuplink.raid_spell
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY req_int, name;`,
    { wrapJson: true },
  ).catch(() => [])) as SpellSqlRow[];
  return (rows ?? []).map(toTpl);
}

/** Один шаблон — и выключенный тоже: отказ на касте должен быть осмысленным. */
export async function loadSpellTemplate(id: string): Promise<SpellTpl | null> {
  const rows = (await mcpExec(
    `SELECT ${COLUMNS} FROM yuplink.raid_spell WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as SpellSqlRow[];
  const row = rows?.[0];
  return row ? toTpl(row) : null;
}

/** Шаблоны выученного скопом: книга рисуется одним запросом, а не N. */
export async function spellTemplateMap(ids: string[]): Promise<Map<string, SpellTpl>> {
  const list = await loadSpellTemplates({ ids, activeOnly: false });
  return new Map(list.map((t) => [t.id, t]));
}

/**
 * Цена и откат ЭТОГО героя: скидку от интеллекта считает общий модуль
 * (spellPower), здесь только точка приложения. Держим рядом с шаблоном, чтобы
 * книга, каст и столб брали одни и те же числа из одного места.
 */
export function spellCostFor(
  tpl: SpellTpl,
  intellect: number,
): { energy: number; cooldownMinutes: number } {
  return {
    energy: spellEnergyCost(tpl.energyCost, intellect),
    cooldownMinutes: spellCooldownMinutes(tpl.cooldownMinutes, intellect),
  };
}
