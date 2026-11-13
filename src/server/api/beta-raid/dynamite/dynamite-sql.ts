// SQL броска динамита (lib/dynamite.ts): вызов функции базы, разбор итога, ключ
// нажатия и отказы. Вся запись — yuplink.raid_dynamite_blast
// (migrations/dynamite-01-blast.sql): здесь только как её звать и как читать
// ответ. Чистые функции — без базы, покрыты dynamite-sql.test.ts.
import { sqlStr } from "@/server/api/raid-shared";
import type { DynamiteKind, DynamiteSummary } from "@/lib/dynamite";
import { homedOf, shipsOf, type BlastShip } from "@/server/api/beta-raid/dynamite/dynamite-ships";
import {
  fishOf,
  type BlastDecorIn,
  type BlastFish,
  type BlastFishIn,
} from "@/server/api/beta-raid/dynamite/dynamite-bag-items";

export type BlastMine = {
  q: number;
  r: number;
  op: string;
  resource: string | null;
  /** Шаблон постройки и облик — по ним вид анимации взрыва (mineBlastKind). */
  building: string | null;
  skin: string | null;
  block: boolean;
};

export type BlastHit = {
  q: number;
  r: number;
  /** 0 — объект клетки, 1 — беглец под ним. */
  layer: 0 | 1;
  hp: string;
  gen: number;
  /** id объекта с префиксом (boss:…). */
  obj: string;
  /** object_config клетки/беглеца на момент взрыва — правки и снимок шаблона. */
  cfg: unknown;
  dealt: number;
  after: number;
  max: number;
  killed: boolean;
};

export type BlastGuard = { q: number; r: number; dealt: number; killed: boolean; chest: boolean };

export type BlastDecor = {
  q: number;
  r: number;
  d: string;
  planted: boolean;
  bag: string | null;
  re: number | null;
};

/** Что синий сделал с шахтой (raid_dynamite_blue_mine): снял охрану, понизил уровень,
 *  разрушил; алмазная, уже разрушенная, ничья прежняя — ничего. Грибы не трогает. */
export type BlueAct = "guard" | "level" | "broken" | "immune" | "dead" | "none";

export type BlastBlue = {
  q: number;
  r: number;
  act: BlueAct;
  building: string | null;
  skin: string | null;
  block: boolean;
  /** Хозяин шахты/гриба до взрыва (кому «Забрать» и письмо). */
  owner: string | null;
  /** Понижение уровня: прошедшее по старому уровню — хозяину к сбору в «Добычу». */
  pending: number;
};

/** Итог взрыва (ответ функции и detail ключа нажатия). */
export type BlastDetail = {
  was: boolean;
  at: { q: number; r: number };
  paid: number;
  kind: DynamiteKind;
  mines: BlastMine[];
  hits: BlastHit[];
  guards: BlastGuard[];
  decor: BlastDecor[];
  blue: BlastBlue[];
  /** Синий: корабли клетки — разрушены, экипаж — в основной город (dynamite-05). */
  ships: BlastShip[];
  /** Экипаж, которого уже отнесли (отметки ключа, dynamite-crew-home). */
  homed: string[];
  /** Красный: всплывшая рыба на клетках воды — мешочки-рыбы (dynamite-07). */
  fish: BlastFish[];
};

const BLUE_ACTS: readonly BlueAct[] = ["guard", "level", "broken", "immune", "dead", "none"];

export function blastSql(o: {
  op: string;
  mapId: string;
  q: number;
  r: number;
  account: string;
  wallet: string;
  heroId: string;
  stackKey: string;
  cost: number;
  decor: readonly BlastDecorIn[];
  /** Красный — 7 клеток; синий — одна (dynamite-02). */
  kind?: DynamiteKind;
  /** Всплывшая рыба красного (dynamite-07); нет рыбы — вызов прежний, из 11 аргументов. */
  fish?: readonly BlastFishIn[];
}): string {
  const cost = Math.max(0, Number(o.cost) || 0);
  const kind = o.kind === "blue" ? "blue" : "red";
  const fish = o.fish?.length ? `, ${sqlStr(JSON.stringify(o.fish))}::jsonb` : "";
  return `SELECT yuplink.raid_dynamite_blast(${sqlStr(o.op)}, ${sqlStr(o.mapId)},
            ${Math.trunc(o.q)}, ${Math.trunc(o.r)}, ${sqlStr(o.account)}, ${sqlStr(o.wallet)},
            ${sqlStr(o.heroId)}, ${sqlStr(o.stackKey)}, ${cost}::numeric,
            ${sqlStr(JSON.stringify(o.decor))}::jsonb, ${sqlStr(kind)}${fish}) AS res;`;
}

const arr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v)
    ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[])
    : [];
const num = (v: unknown): number => Number(v) || 0;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const reOf = (v: unknown): number | null => (num(v) > 0 ? num(v) : null);

/** jsonb ответа (объектом или строкой) → итог; не разобрали — null. */
export function blastOf(raw: unknown): BlastDetail | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const at = (o.at ?? {}) as Record<string, unknown>;
  return {
    was: o.was === true,
    at: { q: num(at.q), r: num(at.r) },
    paid: num(o.paid),
    kind: o.kind === "blue" ? "blue" : "red",
    ships: shipsOf(o.ships),
    homed: homedOf(o.homed),
    fish: fishOf(o.fish),
    blue: arr(o.blue).map((b) => ({
      q: num(b.q),
      r: num(b.r),
      act: BLUE_ACTS.includes(b.act as BlueAct) ? (b.act as BlueAct) : "none",
      building: str(b.building),
      skin: str(b.skin),
      block: b.block === true,
      owner: str(b.owner),
      pending: num(b.pending),
    })),
    mines: arr(o.mines).map((m) => ({
      q: num(m.q),
      r: num(m.r),
      op: String(m.op ?? ""),
      resource: str(m.resource),
      building: str(m.building),
      skin: str(m.skin),
      block: m.block === true,
    })),
    hits: arr(o.hits).map((h) => ({
      q: num(h.q),
      r: num(h.r),
      layer: num(h.layer) === 1 ? 1 : 0,
      hp: String(h.hp ?? ""),
      gen: num(h.gen),
      obj: String(h.obj ?? ""),
      cfg: h.cfg ?? null,
      dealt: num(h.dealt),
      after: num(h.after),
      max: num(h.max),
      killed: h.killed === true,
    })),
    guards: arr(o.guards).map((g) => ({
      q: num(g.q),
      r: num(g.r),
      dealt: num(g.dealt),
      killed: g.killed === true,
      chest: g.chest === true,
    })),
    decor: arr(o.decor).map((d) => ({
      q: num(d.q),
      r: num(d.r),
      d: String(d.d ?? ""),
      planted: d.planted === true,
      bag: str(d.bag),
      re: reOf(d.re),
    })),
  };
}

/** Итог для окна и тоста: шахт снесено, целей задето, повержено, декора. */
export function summaryOfBlast(d: BlastDetail): DynamiteSummary {
  const kills = d.hits.filter((h) => h.killed).length + d.guards.filter((g) => g.killed).length;
  const acts = (a: BlueAct) => d.blue.filter((b) => b.act === a).length;
  return {
    mines: d.mines.length,
    hits: d.hits.length + d.guards.length,
    kills,
    decor: d.decor.length,
    guardsOff: acts("guard"),
    levelsDown: acts("level"),
    broken: acts("broken"),
    ships: d.ships.length,
    fish: d.fish.length,
  };
}

/** Ключ нажатия: итог и разослан ли взрыв. */
export type BlastOpRow = { detail: unknown; sent: boolean | null };

export const blastOpSql = (op: string): string =>
  `SELECT detail, (sent_at IS NOT NULL) AS sent
     FROM yuplink.raid_dynamite_op WHERE op = ${sqlStr(op)} LIMIT 1;`;

export const blastSentSql = (op: string): string =>
  `UPDATE yuplink.raid_dynamite_op SET sent_at = now()
    WHERE op = ${sqlStr(op)} AND sent_at IS NULL;`;

/** Отказ базы → ключ словаря (translations/dynamite.ts); незнакомое — «не вышло». */
export function blastErrorKey(msg: string, energy: number): string {
  if (/not_enough_energy/.test(msg))
    return `mineplace.no_energy|${JSON.stringify({ need: energy })}`;
  const known = /dynamite_(far|no_cell|void|town|no_item|island|own_ship)/.exec(msg);
  if (known) return `dynamite.${known[1]}`;
  return "dynamite.busy";
}
