// Основной замок игрока (владелец, 07.10.2026): войти в замок можно только у
// своего основного замка. По умолчанию это замок в центре карты; ратушу можно
// сделать основным замком — первый раз бесплатно, дальше каждое переселение
// стоило 5 билетов; с 20.10.2026 билетов нет (§8.61) — 2 500 золота (5 × 500).
// Таблица — migrations/home-01-account-home-castle.sql.
import { goldForTicketPrice } from "@/lib/ticketGold";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { castleCell, cellAtCastle } from "./castle";
import { hexDistance } from "./helpers";
import type { Cell } from "./encounter-where";

/** Цена переселения после первого выбора, золото (бывшие 5 билетов × 500). */
export const HOME_MOVE_COST = goldForTicketPrice(5);

export type HomePlace = { kind: "castle" | "town"; q: number; r: number; name: string };

type HomeRow = { q: number; r: number; kind: "castle" | "town"; moves: number };
type TownRow = { q: number; r: number; name: string | null };

const castleName = "Замок";
const townName = (t: TownRow) => t.name || `Ратуша ${t.q},${t.r}`;

/** Строка основного замка на этой карте; на другой карте выбор не действует. */
async function homeRow(account: string, mapId: string): Promise<HomeRow | null> {
  const rows = (await mcpExec(
    `SELECT q, r, kind, moves FROM yuplink.account_home_castle
      WHERE account_id = ${sqlStr(account)} AND map_id = ${sqlStr(mapId)};`,
    { wrapJson: true },
  )) as HomeRow[];
  const row = rows?.[0];
  return row
    ? { q: Number(row.q), r: Number(row.r), kind: row.kind, moves: Number(row.moves) }
    : null;
}

/** Выбирал ли игрок основной замок хоть раз (на любой карте) — от этого цена. */
async function everChose(account: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT 1 AS x FROM yuplink.account_home_castle WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as unknown[];
  return (rows?.length ?? 0) > 0;
}

/** Ратуши вплотную к клетке героя (радиус замка — 1). */
async function townsNear(mapId: string, pos: Cell): Promise<TownRow[]> {
  const rows = (await mcpExec(
    `SELECT q, r, config->>'name' AS name FROM yuplink.raid_town
      WHERE map_id = ${sqlStr(mapId)}
        AND q BETWEEN ${pos.q - 1} AND ${pos.q + 1}
        AND r BETWEEN ${pos.r - 1} AND ${pos.r + 1};`,
    { wrapJson: true },
  )) as TownRow[];
  return (rows ?? [])
    .map((t) => ({ q: Number(t.q), r: Number(t.r), name: t.name }))
    .filter((t) => hexDistance(pos.q, pos.r, t.q, t.r) <= 1);
}

/** Основной замок игрока на карте (по умолчанию — центральный). */
export async function homePlace(account: string, mapId: string): Promise<HomePlace> {
  const row = await homeRow(account, mapId);
  if (row?.kind === "town") {
    const t = (await mcpExec(
      `SELECT config->>'name' AS name FROM yuplink.raid_town
        WHERE map_id = ${sqlStr(mapId)} AND q = ${row.q} AND r = ${row.r};`,
      { wrapJson: true },
    )) as Array<{ name: string | null }>;
    // Ратушу снесли — основным снова становится центральный замок.
    if (t?.length)
      return { kind: "town", q: row.q, r: row.r, name: townName({ ...row, name: t[0].name }) };
  }
  return castlePlace(mapId, await castleCell(mapId));
}

/**
 * Замок как место. Стоит на ратуше (главный мир: ратуша Юпленда, 10.10.2026)
 * — это ратуша: основной по умолчанию у всех, кто не выбирал, и тот же, что у
 * выбравших её руками, — samePlace сравнивает вид.
 */
async function castlePlace(mapId: string, c: Cell): Promise<HomePlace> {
  const t = (await mcpExec(
    `SELECT config->>'name' AS name FROM yuplink.raid_town
      WHERE map_id = ${sqlStr(mapId)} AND q = ${c.q} AND r = ${c.r};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ name: string | null }>;
  return t?.length
    ? { kind: "town", q: c.q, r: c.r, name: townName({ q: c.q, r: c.r, name: t[0].name }) }
    : { kind: "castle", q: c.q, r: c.r, name: castleName };
}

/** Замок или ратуша, у которых стоит герой (null — ни у чего). */
export async function placeHere(mapId: string, pos: Cell | null): Promise<HomePlace | null> {
  if (!pos) return null;
  const c = await castleCell(mapId);
  if (cellAtCastle(pos, c)) return castlePlace(mapId, c);
  const t = (await townsNear(mapId, pos))[0];
  return t ? { kind: "town", q: t.q, r: t.r, name: townName(t) } : null;
}

/**
 * Ратуша вплотную к герою на карте острова новичка (§8.47): через неё он
 * входит в замок — учится, что где. Своего замка в центре у острова нет.
 */
export async function islandTownHere(mapId: string, pos: Cell | null): Promise<HomePlace | null> {
  if (!pos) return null;
  const t = (await townsNear(mapId, pos))[0];
  return t ? { kind: "town", q: t.q, r: t.r, name: townName(t) } : null;
}

export const samePlace = (a: HomePlace | null, b: HomePlace | null) =>
  !!a && !!b && a.kind === b.kind && a.q === b.q && a.r === b.r;

/** Цена смены основного замка: первый выбор бесплатно. */
export async function homeMoveCost(account: string): Promise<number> {
  return (await everChose(account)) ? HOME_MOVE_COST : 0;
}

/**
 * Сделать place основным замком. Плата (золото) и запись — одним запросом: не
 * хватило золота — res_move бросает «в минус», и выбор не меняется. ref
 * операции — opId нажатия: повтор того же нажатия второй раз не спишет — и
 * замок не сменит: уже использованный ключ (applied=false) строку не вставляет,
 * иначе один opId переселял бы бесплатно сколько угодно раз.
 */
export async function setHome(opts: {
  account: string;
  wallet: string;
  mapId: string;
  place: HomePlace;
  cost: number;
  opId: string;
}): Promise<void> {
  const { account, mapId, place, cost, opId } = opts;
  const acc = sqlStr(account);
  // Оплата — подзапрос внутри самой вставки, а не отдельный WITH: обёртка
  // mcpExec (wrapJsonCte) сама кладёт запрос в WITH, и вложенный WITH с
  // INSERT база отвергает («WITH clause containing a data-modifying statement
  // must be at the top level») — выбор основного замка не проходил ни разу.
  const pay =
    cost > 0
      ? `SELECT applied FROM yuplink.res_move(${acc}, 'gold', ${-cost}, 'home_castle', ${sqlStr(`home:${opId}`)})`
      : `SELECT true AS applied`;
  const rows = await mcpExec(
    `INSERT INTO yuplink.account_home_castle (account_id, map_id, q, r, kind, moves, updated_at)
     SELECT ${acc}, ${sqlStr(mapId)}, ${place.q}, ${place.r}, ${sqlStr(place.kind)}, 1, now()
       FROM (${pay}) pay
      WHERE pay.applied
     ON CONFLICT (account_id) DO UPDATE
       SET map_id = EXCLUDED.map_id, q = EXCLUDED.q, r = EXCLUDED.r, kind = EXCLUDED.kind,
           moves = yuplink.account_home_castle.moves + 1, updated_at = now()
     RETURNING moves;`,
    { wrapJsonCte: true },
  ).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(/в минус/.test(msg) ? `Не хватает золота: нужно ${cost}` : msg);
  });
  // Ключ нажатия уже проведён раньше (повтор после успеха отсекает samePlace
  // выше) — оплаты нет, замок не меняем. Новое нажатие даёт новый opId.
  if (!rows?.length) throw new Error("err.op_reused");
}
