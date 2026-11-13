// SQL админки промокодов: завести код со строками, список со счётчиками,
// флаг, удаление. Чистые строители — под тест без базы.
import { sqlStr } from "@/server/api/raid-shared";
import { isPromoKind, type PromoCodeAdmin, type PromoKind } from "@/lib/promo/promoTypes";

export type NewLine = {
  kind: PromoKind;
  ref: string | null;
  title: string | null;
  image: string | null;
  min: number;
  max: number;
  chance: number;
  budget: number | null;
};

const txt = (v: string | null): string => (v ? `${sqlStr(v)}::text` : "NULL::text");
const big = (v: number | null): string => (v == null ? "NULL::bigint" : `${Math.floor(v)}::bigint`);

/**
 * Код и его строки — ОДНИМ запросом: без строк код не живёт ни мгновения.
 * Занятый код (в том числе среди кодов на лайки — профиль спросил бы новый
 * первым и старый стал бы недостижим) — пустой id в ответе.
 */
export function createSql(o: {
  id: string;
  code: string;
  maxUsers: number | null;
  createdBy: string;
  lines: NewLine[];
}): string {
  const values = o.lines
    .map(
      (l, i) =>
        `(${i}::smallint, ${sqlStr(l.kind)}::text, ${txt(l.ref)}, ${txt(l.title)}, ${txt(l.image)},
          ${big(l.min)}, ${big(l.max)}, ${Number(l.chance)}::numeric, ${big(l.budget)})`,
    )
    .join(",\n         ");
  const code = sqlStr(o.code);
  return `WITH c AS (
       INSERT INTO yuplink.promo_code (id, code, max_users, created_by)
       SELECT ${sqlStr(o.id)}, ${code}, ${o.maxUsers == null ? "NULL" : Math.floor(o.maxUsers)},
              ${sqlStr(o.createdBy)}
        WHERE NOT EXISTS (SELECT 1 FROM yuplink.like_promocodes WHERE code = ${code})
       ON CONFLICT DO NOTHING
       RETURNING id
     ), l AS (
       INSERT INTO yuplink.promo_code_line
         (code_id, idx, kind, ref_id, title, image, amount_min, amount_max, chance, budget)
       SELECT c.id, v.idx, v.kind, v.ref_id, v.title, v.image, v.amin, v.amax, v.chance, v.budget
         FROM c, (VALUES ${values})
           AS v(idx, kind, ref_id, title, image, amin, amax, chance, budget)
       RETURNING 1
     )
     SELECT (SELECT id FROM c) AS id, (SELECT count(*) FROM l)::int AS lines;`;
}

/** Свой ли это код (повтор того же «Создать» после потерянного ответа). */
export const ownCodeSql = (id: string): string =>
  `SELECT id, code FROM yuplink.promo_code WHERE id = ${sqlStr(id)};`;

/**
 * Список с тем, что уже выдано по строкам. Свежие сверху; limit + 1 строка —
 * по лишней видно, есть ли ещё («Показать ещё»).
 */
export const listSql = (limit: number, by: string | null = null): string =>
  `SELECT c.id, c.code, c.active, c.max_users, c.used_users, c.created_at, c.created_by,
       COALESCE((SELECT json_agg(json_build_object(
                  'idx', l.idx, 'kind', l.kind, 'ref', l.ref_id, 'title', l.title,
                  'image', l.image, 'min', l.amount_min, 'max', l.amount_max,
                  'chance', l.chance, 'budget', l.budget, 'given', l.given) ORDER BY l.idx)
                   FROM yuplink.promo_code_line l WHERE l.code_id = c.id), '[]'::json) AS lines
  FROM yuplink.promo_code c${
    by
      ? `
 WHERE c.created_by = ${sqlStr(by)}`
      : ""
  }
 ORDER BY c.created_at DESC, c.id
 LIMIT ${Math.max(1, Math.floor(limit)) + 1}`;

/**
 * Ссылки строк есть в своих справочниках: токен — в реестре (DARAI — всегда),
 * товар, бокс (фишки, мистик, NFT), артефакт, герой, босс. Ответ — строка на
 * ссылку с ok; пустой список — пустая строка (звать не нужно).
 */
export function refsSql(lines: Array<{ idx: number; kind: PromoKind; ref: string }>): string {
  const values = lines
    .map((l) => `(${l.idx}, ${sqlStr(l.kind)}::text, ${sqlStr(l.ref)}::text)`)
    .join(", ");
  const has = (table: string, extra = "") =>
    `EXISTS (SELECT 1 FROM yuplink.${table} x WHERE x.id = v.ref${extra})`;
  return `SELECT v.idx, CASE v.kind
      WHEN 'token' THEN v.ref = 'Darai'
        OR EXISTS (SELECT 1 FROM yuplink.reward_tokens t WHERE lower(t.symbol) = lower(v.ref))
      WHEN 'resource' THEN v.ref IN ('gold', 'stone', 'wood', 'diamonds')
      WHEN 'custom' THEN ${has("raid_custom_item")}
      WHEN 'pack' THEN ${has("chip_packs")} OR ${has("nft_packs")}
      WHEN 'art' THEN ${has("mystic_item_template", " AND x.kind = 'artifact'")}
      WHEN 'hero' THEN ${has("mystic_item_template", " AND x.kind = 'hero'")}
      WHEN 'boss' THEN ${has("raid_boss_template")}
      ELSE false END AS ok
    FROM (VALUES ${values}) AS v(idx, kind, ref)`;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const numOrNull = (v: unknown): number | null => (v == null ? null : num(v));
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function linesOf(v: unknown): PromoCodeAdmin["lines"] {
  let arr = v;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.flatMap((raw) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    if (!isPromoKind(l.kind)) return [];
    return [
      {
        idx: num(l.idx),
        kind: l.kind,
        ref: strOrNull(l.ref),
        title: strOrNull(l.title),
        image: strOrNull(l.image),
        min: num(l.min),
        max: num(l.max),
        chance: num(l.chance),
        budget: numOrNull(l.budget),
        given: num(l.given),
      },
    ];
  });
}

/** Строки списка из базы → вид админки. */
export function listOf(rows: unknown): PromoCodeAdmin[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      code: String(r.code ?? ""),
      active: r.active === true,
      maxUsers: numOrNull(r.max_users),
      usedUsers: num(r.used_users),
      createdAt: String(r.created_at ?? ""),
      createdBy: strOrNull(r.created_by),
      lines: linesOf(r.lines),
    };
  });
}

/** by — только свой код (право promo_soft); null — любой (админ). */
const mine = (col: string, by: string | null): string => (by ? ` AND ${col} = ${sqlStr(by)}` : "");

export const toggleSql = (id: string, active: boolean, by: string | null = null): string =>
  `UPDATE yuplink.promo_code SET active = ${active ? "true" : "false"}
    WHERE id = ${sqlStr(id)}${mine("created_by", by)} RETURNING id`;

/** Удалить — только код, который ни разу не вводили (строки уходят каскадом). */
export const deleteSql = (id: string, by: string | null = null): string =>
  `DELETE FROM yuplink.promo_code c
    WHERE c.id = ${sqlStr(id)}${mine("c.created_by", by)}
      AND NOT EXISTS (SELECT 1 FROM yuplink.promo_redemption r WHERE r.code_id = c.id)
    RETURNING id`;
