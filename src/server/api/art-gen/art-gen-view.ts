// Что окно генератора (§8.122) показывает о заданиях игрока: статус, картинку,
// что выпало и можно ли ещё сделать арт уникальным — пока ни одна копия
// шаблона никому не выпала (вещь создателя — единственный экземпляр).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { CraftRarity } from "@/lib/craft/craftTable";
import type { CraftRoll } from "@/lib/craft/craftRoll";
import { craftItemId } from "@/server/api/craft/lab-finish";

export type GenJobView = {
  id: string;
  /** Генератор, где заказан: уникальным арт делает только он (§8.122). */
  mapId: string | null;
  q: number | null;
  r: number | null;
  rarity: CraftRarity;
  name: string;
  status: "paying" | "queued" | "done" | "failed";
  /** Когда генератор освободится (занят квотой) — окно не дёргает его раньше. */
  nextAt: string;
  roll: CraftRoll;
  imageUrl: string | null;
  templateId: string | null;
  /** Арт уже уникальный. */
  unique: boolean;
  /** Копия этого шаблона у кого-то ещё — уникальным не сделать. */
  copied: boolean;
  /** Сам арт (вещь создателя) лежит у игрока — уникальным делают только свой. */
  owned: boolean;
  /** Не вышло, и цена уже вернулась. */
  refunded: boolean;
  createdAt: string;
};

const json = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;

/**
 * Есть ли копия шаблона где-то, кроме вещи создателя: в инвентарях, на карте
 * (раскладка), на полке лавки, в лоте аукциона, в неполученном подарке, в
 * промокоде. `tpl` и `item` — SQL-выражения (id шаблона и вещи создателя).
 */
export const copiesSql = (tpl: string, item: string): string =>
  `(EXISTS (SELECT 1 FROM yuplink.user_game_item u WHERE u.template_id = ${tpl} AND u.id <> ${item})
    OR EXISTS (SELECT 1 FROM yuplink.raid_map_cells mc WHERE mc.object_id = 'artifact:' || ${tpl})
    OR EXISTS (SELECT 1 FROM yuplink.raid_market_item mi WHERE mi.ref_id = ${tpl})
    OR EXISTS (SELECT 1 FROM yuplink.auction a
                WHERE a.prize_ref = ${tpl} OR strpos(coalesce(a.escrow::text, ''), ${tpl}) > 0)
    OR EXISTS (SELECT 1 FROM yuplink.player_gift g WHERE g.ref_id = ${tpl})
    OR EXISTS (SELECT 1 FROM yuplink.promo_code_line pl WHERE pl.ref_id = ${tpl}))`;

const COLS = `c.id, c.map_id, c.q, c.r, c.rarity, c.name, c.status, c.next_at, c.roll, c.image_url,
  c.template_id, c.created_at, (c.refunded_at IS NOT NULL) AS refunded,
  coalesce(t.meta->>'unique', '') = 'true' AS uniq,
  (c.template_id IS NOT NULL AND ${copiesSql("c.template_id", "'ugi_craft_' || c.id")}) AS copied,
  EXISTS (SELECT 1 FROM yuplink.user_game_item o
           WHERE o.id = 'ugi_craft_' || c.id AND o.account_id = c.account_id) AS owned`;

function toView(r: Record<string, unknown>): GenJobView {
  return {
    id: String(r.id),
    mapId: r.map_id == null ? null : String(r.map_id),
    q: r.q == null ? null : Number(r.q),
    r: r.r == null ? null : Number(r.r),
    rarity: String(r.rarity) as CraftRarity,
    name: String(r.name),
    status: String(r.status) as GenJobView["status"],
    nextAt: String(r.next_at),
    roll: json<CraftRoll>(r.roll),
    imageUrl: r.image_url == null ? null : String(r.image_url),
    templateId: r.template_id == null ? null : String(r.template_id),
    unique: r.uniq === true,
    copied: r.copied === true,
    owned: r.owned === true,
    refunded: r.refunded === true,
    createdAt: String(r.created_at),
  };
}

async function read(where: string, limit: number): Promise<GenJobView[]> {
  const rows = (await mcpExec(
    `SELECT ${COLS}
       FROM yuplink.artifact_craft c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.template_id
      WHERE c.kind = 'gen' AND ${where}
      ORDER BY c.created_at DESC
      LIMIT ${limit};`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>> | null;
  return (rows ?? []).map(toView);
}

/** Последние задания игрока — во всех генераторах. */
export const listGenJobs = (account: string, limit = 10) =>
  read(`c.account_id = ${sqlStr(account)}`, Math.max(1, Math.min(50, Math.floor(limit))));

export async function loadGenJob(account: string, id: string): Promise<GenJobView | null> {
  return (await read(`c.account_id = ${sqlStr(account)} AND c.id = ${sqlStr(id)}`, 1))[0] ?? null;
}

/** Ключ вещи создателя — тот же, что пишет lab-finish (копии — всё, что не она). */
export const creatorItemId = craftItemId;
