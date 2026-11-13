// «Вещи героев» в складе замка (владелец, 06.11.2026: «просмотр инвентаря всех
// своих героев… понять, у кого что лежит по карманам — кто-то на ферме и, может,
// утащил с собой что-то нужное»; «забрать — только выбрав основным»).
//
// Только чтение: герои аккаунта, кроме основного (его рюкзак уже в окне склада),
// у кого в рюкзаке что-то есть, — с вещами и тем, где герой: на поле (карта,
// клетка, мир), на отдыхе (до когда) или в замке. Одним запросом.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { sqlStr } from "./raid-shared";
import { raidOwner } from "./beta-raid/owner";

export type HeroItemsStack = {
  stackKey: string;
  name: string;
  image: string | null;
  count: number;
  kind: string | null;
};

export type HeroItemsCard = {
  id: string;
  name: string;
  level: number;
  image: string | null;
  /** Отдыхает до (ISO), иначе null. */
  restUntil: string | null;
  /** На поле: клетка, мир; here — поле на карте, где сейчас основной герой. */
  field: { q: number; r: number; world: string | null; here: boolean } | null;
  items: HeroItemsStack[];
};

type Row = {
  id: string;
  level: number | string | null;
  name: string | null;
  image: string | null;
  rest_until: string | null;
  field_map: string | null;
  field_q: number | null;
  field_r: number | null;
  field_world: string | null;
  items: unknown;
};

/** Герои аккаунта с вещами, кроме основного; total — все неосновные герои. */
export function heroItemsSql(account: string): string {
  const acc = sqlStr(account);
  return `SELECT h.id, h.level,
            COALESCE(NULLIF(t.name, ''), 'Герой') AS name, t.image_url AS image,
            CASE WHEN h.rest_until > now() THEN h.rest_until END AS rest_until,
            w.map_id AS field_map, w.q AS field_q, w.r AS field_r,
            COALESCE(f.name, m.name) AS field_world,
            (SELECT json_agg(json_build_object('stackKey', b.stack_key, 'name', b.name,
                    'image', b.image, 'count', b.count, 'kind', b.kind) ORDER BY b.name, b.stack_key)
               FROM yuplink.raid_hero_backpack b
              WHERE b.hero_id = h.id AND b.count > 0) AS items
       FROM yuplink.hero_instance h
       LEFT JOIN yuplink.mystic_item_template t ON t.id = h.template_id
       LEFT JOIN yuplink.raid_field_worker w ON w.hero_id = h.id
       LEFT JOIN yuplink.raid_maps m ON m.id = w.map_id
       LEFT JOIN yuplink.raid_floor f ON f.map_id = w.map_id
      WHERE h.account_id = ${acc} AND h.selected_at IS NULL
        AND EXISTS (SELECT 1 FROM yuplink.raid_hero_backpack b WHERE b.hero_id = h.id AND b.count > 0)
      ORDER BY h.level DESC, h.created_at, h.id`;
}

const parseItems = (v: unknown): HeroItemsStack[] => {
  const raw = typeof v === "string" ? (JSON.parse(v) as unknown) : v;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const s = x as Record<string, unknown>;
    const count = Number(s.count);
    if (typeof s.stackKey !== "string" || !(count > 0)) return [];
    return [{
      stackKey: s.stackKey,
      name: typeof s.name === "string" ? s.name : "",
      image: typeof s.image === "string" && s.image ? s.image : null,
      count,
      kind: typeof s.kind === "string" ? s.kind : null,
    }];
  });
};

/** Строки базы → карточки; here — поле на карте основного героя. */
export function heroCards(rows: readonly Row[], hereMap: string | null): HeroItemsCard[] {
  return rows.flatMap((r) => {
    const items = parseItems(r.items);
    if (!items.length) return [];
    const onField = r.field_map != null && r.field_q != null && r.field_r != null;
    return [{
      id: String(r.id),
      name: String(r.name ?? "Герой"),
      level: Number(r.level) || 1,
      image: r.image ?? null,
      restUntil: r.rest_until ? String(r.rest_until) : null,
      field: onField
        ? { q: Number(r.field_q), r: Number(r.field_r), world: r.field_world ?? null, here: r.field_map === hereMap }
        : null,
      items,
    }];
  });
}

export const getMyHeroesItems = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ heroes: HeroItemsCard[]; total: number }> => {
    const wallet = await requireWallet();
    const account = await raidOwner(wallet);
    const { myMapId } = await import("./beta-raid/encounter-where");
    const [rows, total, here] = await Promise.all([
      mcpExec(heroItemsSql(account), { wrapJson: true }) as Promise<Row[]>,
      mcpExec(
        `SELECT count(*)::int AS n FROM yuplink.hero_instance
          WHERE account_id = ${sqlStr(account)} AND selected_at IS NULL;`,
        { wrapJson: true },
      ) as Promise<Array<{ n: number }>>,
      myMapId(wallet).catch(() => null),
    ]);
    return { heroes: heroCards(rows ?? [], here), total: Number(total?.[0]?.n) || 0 };
  },
);
