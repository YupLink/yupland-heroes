// Рынок героев: выставить одного героя пачки — снимок карманов, раскладка
// основному (hm-pockets-plan), вызов hero_market_list (migrations/hero-market-03).
//
// Ёмкость основного считает код, раскладку — тоже код (общая арифметика
// рюкзака), а база под замками рюкзаков сверяет основного и отпечаток снимка:
// не совпало (основного сменили, в рюкзак что-то легло) — 'pockets_changed',
// снимок перечитываем и считаем заново, до TRIES раз; дальше — «повтори».
// Повтор того же нажатия база узнаёт по ключу раньше любых сверок.
//
// Согласие «пусть выпадет» — по герою и на показанный список: acceptKey с
// клиента должен совпасть с dropsKey раскладки, которую база сейчас применит
// (отпечаток гарантирует, что это она). Выпадает другое — согласия нет, база
// отвечает pockets_overflow, итог несёт новый список и новый ключ.
import { DMINE_CARRY_MS } from "@/lib/daraiMine";
import { callFn, listCallSql, type HmResult } from "@/server/api/hero-market/hm-call";
import {
  dropsKey,
  dropsOf,
  planJson,
  planPockets,
  type PocketLine,
} from "@/server/api/hero-market/hm-pockets-plan";
import {
  mainCapsOf,
  pocketOf,
  readPocketsSnap,
  type MainCaps,
} from "@/server/api/hero-market/hm-pockets-read";

/** Сколько раз пересчитать раскладку, если рюкзаки поменялись под рукой. */
const TRIES = 3;

export type ListOneIn = {
  op: string;
  account: string;
  wallet: string;
  itemId: string;
  priceGold: number | null;
  priceDarai: number | null;
  /** dropsKey списка «выпадет», который игрок видел и принял (превью или прошлый отказ). */
  acceptKey?: string;
};

/** Основной герой пачки: читается раз, перечитывается после «поменялось». */
export type ListCtx = { caps?: MainCaps | null };

/** Ответ базы, раскладка, с которой звали, и её ключ согласия (для окна «выпадет»). */
export type ListOneOut = { r: HmResult; lines: PocketLine[]; key: string };

const n = (v: unknown): number => Math.max(0, Number(v) || 0);

/** Раскладка из ответа базы (moves лота) — то, что сделано на самом деле. */
export function linesOfMoves(v: unknown): PocketLine[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      ...pocketOf(m),
      main: n(m.main),
      bag: n(m.bag),
      burn: n(m.burn),
      plant: n(m.plant),
    }));
}

export async function listOne(o: ListOneIn, ctx: ListCtx): Promise<ListOneOut> {
  for (let i = 0; i < TRIES; i++) {
    if (ctx.caps === undefined || i > 0) ctx.caps = await mainCapsOf(o.wallet);
    const snap = await readPocketsSnap(o.account, o.itemId, ctx.caps);
    const lines = planPockets(snap.rows, snap.main);
    const key = dropsKey(dropsOf(lines));
    const r = await callFn(
      listCallSql({
        op: o.op,
        account: o.account,
        wallet: o.wallet,
        itemId: o.itemId,
        priceGold: o.priceGold,
        priceDarai: o.priceDarai,
        mainId: snap.main?.heroId ?? null,
        plan: planJson(lines, DMINE_CARRY_MS / 1000),
        seen: snap.seen,
        accept: key !== "" && o.acceptKey === key,
      }),
    );
    if (r.ok || r.error !== "pockets_changed") return { r, lines, key };
  }
  return { r: { ok: false, error: "busy_retry" }, lines: [], key: "" };
}
