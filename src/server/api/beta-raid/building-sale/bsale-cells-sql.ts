// Таблицы клетки, что делают постройку живой («плавильня не работает»): витрина
// маркета, фильтр покупателей, заклинания зачарования, обряды героев. Шаблон
// постройки снимает их строки (без адреса клетки), установка кладёт на новую
// клетку тем же оператором, разбор стирает.
//
// Столбцы перечислены здесь, а не «вся строка как есть»: новый столбец таблицы
// получит своё значение по умолчанию, а старый снимок без столбца — COALESCE
// с умолчанием базы, а не NULL в NOT NULL. Привязка лавки к ратуше (town_q/r)
// не едет — её координаты от клетки-источника. Запас и лимиты — у каждой копии свои.
import { sqlStr } from "@/server/api/raid-shared";

type Col = { name: string; def?: string };
type CellTable = {
  /** Ключ в снимке. */
  key: string;
  table: string;
  /** Приставка нового id; null — таблица по адресу клетки (одна строка). */
  idPrefix: string | null;
  /** Поведение клетки, которому нужна таблица. */
  effects: readonly string[];
  cols: readonly Col[];
  /** Чем заполнить при установке поверх снимка. */
  fresh: Readonly<Record<string, string>>;
  /** Что ещё сбросить, заменяя строку по адресу клетки. */
  reset?: string;
};

const c = (name: string, def?: string): Col => ({ name, def });

export const CELL_TABLES: readonly CellTable[] = [
  {
    key: "market_item",
    table: "raid_market_item",
    idPrefix: "mkt_",
    effects: ["market"],
    cols: [
      c("pos", "0"),
      c("kind"),
      c("ref_id"),
      c("give_amount", "1"),
      c("name"),
      c("image"),
      c("price_resource"),
      c("price_token"),
      c("price_amount"),
      c("buyer_mode", "'all'"),
      c("buyer_races", "'[]'::jsonb"),
      c("buyer_specs", "'[]'::jsonb"),
      c("stock"),
      c("price2_resource"),
      c("price2_token"),
      c("price2_amount"),
      c("give_token"),
      c("side", "'buy'"),
      c("per_account_limit"),
      c("outcomes"),
      c("price_more", "'[]'::jsonb"),
    ],
    fresh: { sold: "0", created_at: "now()" },
  },
  {
    key: "market_shop",
    table: "raid_market_shop",
    idPrefix: null,
    effects: ["market"],
    cols: [
      c("buyer_races", "'[]'::jsonb"),
      c("buyer_specs", "'[]'::jsonb"),
      c("pawn_markup", "5"),
      c("pawn_hero_markup", "5"),
    ],
    fresh: { updated_at: "now()" },
    reset: "town_q = NULL, town_r = NULL",
  },
  {
    key: "enchant_spell",
    table: "raid_enchant_spell",
    idPrefix: "esp_",
    effects: ["enchant"],
    cols: [
      c("pos", "0"),
      c("name"),
      c("rarity"),
      c("boost_min"),
      c("boost_max"),
      c("success"),
      c("destroy", "false"),
      c("destroy_chance", "0"),
      c("cost"),
      c("fx"),
    ],
    fresh: { updated_at: "now()" },
  },
  {
    key: "hero_rite",
    table: "raid_hero_rite",
    idPrefix: "hrt_",
    effects: ["hero_enchant"],
    cols: [
      c("pos", "0"),
      c("name"),
      c("rarity"),
      c("need"),
      c("success"),
      c("lose_min"),
      c("lose_max"),
      c("cost"),
    ],
    fresh: { updated_at: "now()" },
  },
];

const at = (alias: string, m: string, q: number, r: number) =>
  `${alias}.map_id = ${m} AND ${alias}.q = ${q} AND ${alias}.r = ${r}`;

/** Снимок таблиц клетки для поведения effect: jsonb {ключ: [строки]} (cells). */
export function captureCellsSql(effect: string | null, mapId: string, q: number, r: number) {
  const m = sqlStr(mapId);
  const parts = CELL_TABLES.filter((t) => effect && t.effects.includes(effect)).map((t) => {
    const keep = t.cols.map((col) => `'${col.name}', x.${col.name}`).join(", ");
    const order = t.cols.some((col) => col.name === "pos") ? " ORDER BY x.pos" : "";
    return `'${t.key}', (SELECT COALESCE(jsonb_agg(jsonb_build_object(${keep})${order}), '[]'::jsonb)
                FROM yuplink.${t.table} x WHERE ${at("x", m, q, r)})`;
  });
  return parts.length ? `jsonb_build_object(${parts.join(", ")})` : "NULL::jsonb";
}

/**
 * Стереть таблицы клетки (CTE, при строке в when). Установка стирает только
 * таблицы со своими id — строку по адресу клетки заменяет putCellsCtes.
 */
export function wipeCellsCtes(o: {
  m: string;
  q: number;
  r: number;
  when: string;
  all: boolean;
}): string[] {
  return CELL_TABLES.filter((t) => o.all || t.idPrefix).map(
    (t) => `wipe_${t.key} AS (
       DELETE FROM yuplink.${t.table} x USING ${o.when}
        WHERE ${at("x", o.m, o.q, o.r)}
       RETURNING 1
     )`,
  );
}

/**
 * Положить снимок plan.cells на клетку (CTE), только если встала постройка (put).
 * id — от ключа нажатия и номера строки: повтор моста даёт те же id.
 */
export function putCellsCtes(o: { m: string; q: number; r: number; key: string }): string[] {
  const out: string[] = [];
  for (const t of CELL_TABLES) {
    const cols = t.cols.map((col) => col.name);
    const vals = t.cols.map((col) =>
      col.def ? `COALESCE(x.${col.name}, ${col.def})` : `x.${col.name}`,
    );
    const freshCols = Object.keys(t.fresh);
    const freshVals = freshCols.map((k) => t.fresh[k]);
    const rows = `FROM put, plan
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(plan.cells->'${t.key}', '[]'::jsonb))
              WITH ORDINALITY e(v, n)
         CROSS JOIN LATERAL jsonb_populate_record(NULL::yuplink.${t.table}, e.v) x`;
    if (t.idPrefix) {
      const id = `'${t.idPrefix}' || substr(md5(${o.key} || ':${t.key}:' || e.n), 1, 16)`;
      out.push(`put_${t.key} AS (
       INSERT INTO yuplink.${t.table} (id, map_id, q, r, ${[...cols, ...freshCols].join(", ")})
       SELECT ${id}, ${o.m}, ${o.q}, ${o.r}, ${[...vals, ...freshVals].join(", ")}
         ${rows}
       ON CONFLICT (id) DO NOTHING
       RETURNING 1
     )`);
      continue;
    }
    // Строка по адресу клетки: есть в снимке — заменить, нет — стереть забытую.
    const set = [...cols, ...freshCols].map((k) => `${k} = EXCLUDED.${k}`);
    out.push(`put_${t.key} AS (
       INSERT INTO yuplink.${t.table} (map_id, q, r, ${[...cols, ...freshCols].join(", ")})
       SELECT ${o.m}, ${o.q}, ${o.r}, ${[...vals, ...freshVals].join(", ")}
         ${rows}
        LIMIT 1
       ON CONFLICT (map_id, q, r) DO UPDATE SET ${[...set, t.reset].filter(Boolean).join(", ")}
       RETURNING 1
     )`);
    out.push(`drop_${t.key} AS (
       DELETE FROM yuplink.${t.table} x USING put, plan
        WHERE ${at("x", o.m, o.q, o.r)}
          AND jsonb_array_length(COALESCE(plan.cells->'${t.key}', '[]'::jsonb)) = 0
       RETURNING 1
     )`);
  }
  return out;
}
