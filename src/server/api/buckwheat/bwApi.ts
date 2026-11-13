// «Корона гречневого королевства» — ручки для браузера. Всем, кто вошёл, — на
// золото (bwAccess, владелец 08.11). Партия и деньги — bwCore.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentWallet, isAdminWallet, requireAdmin } from "../../auth";
import { requireBetaRaid } from "../beta-raid/gate";
import { accAccountId } from "../currency/move";
import { exitFor, loadFor, moveFor, startFor } from "./bwCore";
import type { BwExitResult, BwInit, BwMoveResult, BwWho } from "./bwCore";
import { GAME_ID_RE } from "./bwEngine";
import { ratingFor, type BwRating } from "./bwRating";
import { buckwheatDaraiOpen, buckwheatMode } from "./bwAccess";
import { buckwheatStatsAll, type BwStats } from "./bwStats";
import { alertFundIfShort } from "./bwFundAlert";

/** Партия рассчитана — если выплату добирал пул карты, сообщить (в фоне, ответ не ждёт). */
const fundCheck = (id: string, settled: boolean) => {
  if (settled) void alertFundIfShort(id).catch((e) => console.warn("[bw] fund alert ✗", e));
};

export type { BwExitResult, BwInit, BwMoveResult } from "./bwCore";
export type { BwRating } from "./bwRating";
export type { BwStats } from "./bwStats";

/** Откуда игра: link — ссылка /crown (там ставка DARAI); иначе — постройка в игре. */
const siteSchema = z.object({ site: z.enum(["link"]).optional() });
type Site = z.infer<typeof siteSchema>;

async function who(site: Site = {}): Promise<BwWho> {
  if (!getCurrentWallet()) throw new Error("bw.guest");
  const wallet = await requireBetaRaid();
  const account = await accAccountId(wallet);
  if (!account) throw new Error("bw.need_account");
  const mode = await buckwheatMode(wallet, account);
  if (!mode) throw new Error("bw.closed");
  // Владелец 08.11: всё сегодняшнее — только по ссылке; в игре — как было, на золото.
  return { account, mode, wallet, darai: site.site === "link" && buckwheatDaraiOpen() };
}

/**
 * Журнал игры (08.11: «не даёт зайти»): старт партии и любой отказ — с длительностью;
 * удачные загрузки и ходы не пишем, их много.
 */
async function logged<T>(what: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const res = await fn();
    if (what.startsWith("start")) console.log(`[bw] ${what} ok ${Date.now() - t0}мс`);
    return res;
  } catch (e) {
    console.warn(`[bw] ${what} ✗ ${e instanceof Error ? e.message : e} ${Date.now() - t0}мс`);
    throw e;
  }
}

export const buckwheatLoad = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => siteSchema.default({}).parse(d ?? {}))
  .handler(
    async ({ data }): Promise<BwInit & { admin: boolean }> =>
      logged("load", async () => {
        return { ...(await loadFor(await who(data))), admin: isAdminWallet(getCurrentWallet()) };
      }),
  );

export const buckwheatStart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    siteSchema
      .extend({ currency: z.enum(["gold", "darai"]).default("gold") })
      .default({})
      .parse(d ?? {}),
  )
  .handler(
    async ({ data }): Promise<BwInit> =>
      logged(`start ${data.currency}`, async () => startFor(await who(data), data.currency)),
  );

const cell = z.number().int().min(0).max(31);
const idSchema = z.string().regex(GAME_ID_RE);

export const buckwheatMove = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: idSchema,
        count: z.number().int().min(0).max(500),
        move: z.tuple([cell, cell, cell, cell]),
      })
      .parse(d),
  )
  .handler(
    async ({ data }): Promise<BwMoveResult> =>
      logged(`move ${data.count}`, async () => {
        const w = await who();
        const res = await moveFor(w.account, data.id, data.count, data.move, w.wallet);
        fundCheck(data.id, !!res.settlement);
        return res;
      }),
  );

export const buckwheatExit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: idSchema, count: z.number().int().min(0).max(500) }).parse(d),
  )
  .handler(async ({ data }): Promise<BwExitResult> => {
    const w = await who();
    const res = await exitFor(w.account, data.id, data.count, w.wallet);
    fundCheck(data.id, true);
    return res;
  });

export const buckwheatRating = createServerFn({ method: "GET" }).handler(
  async (): Promise<BwRating> => ratingFor((await who()).account),
);

// Сбои связи окна игры и страницы — в журнал сервера (не больше 30 строк в минуту).
let logWindow = { at: 0, n: 0 };
export const buckwheatClientLog = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ text: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const now = Date.now();
    if (now - logWindow.at > 60_000) logWindow = { at: now, n: 0 };
    if (++logWindow.n > 30) return { ok: false as const };
    const wallet = getCurrentWallet();
    const clean = Array.from(data.text, (ch) => (ch.charCodeAt(0) < 32 ? " " : ch)).join("");
    console.warn(`[bw] client ${wallet ?? "гость"} ${clean}`);
    return { ok: true as const };
  });

/** Статистика ставок — только админам. */
export const buckwheatStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<BwStats> => {
    requireAdmin();
    return buckwheatStatsAll();
  },
);
