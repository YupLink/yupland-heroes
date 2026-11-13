// Вкладка «$ Экономика → Клад» (lib/treasure): фонд призов, который админ
// собирает заранее («фонд заранее — на неделю — золото, дараи, шмотка»), и
// закопанные клады с миром, координатами, призом и скрином. Только «админ» клада —
// владелец и Ярослав (ADMIN_TG_IDS, владелец 07.11.2026): прочие админ-кошельки
// координат живого клада не видят.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { getSessionTgId, requireAdmin } from "@/server/auth";
import { pg } from "@/server/db/pg";
import { isUsdt } from "@/lib/usdtBanned";
import { MARKET_PRICE_RESOURCES, type MarketPriceResource } from "@/lib/marketItem";
import { prizeNeedsRef, prizeProblem, type TreasureStatus } from "@/lib/treasure";
import { treasureAdminIds } from "./treasure-tg";

export type FundPrize = {
  id: string;
  resource: MarketPriceResource;
  token: string | null;
  amount: number;
  name: string | null;
  /** Сейчас закопан (живой клад с этим призом). */
  live: boolean;
};

export type TreasureView = {
  id: string;
  date: string;
  world: string;
  q: number;
  r: number;
  resource: MarketPriceResource;
  token: string | null;
  amount: number;
  name: string | null;
  status: TreasureStatus;
  until: string;
  finder: string | null;
};

export type TreasureAdmin = { fund: FundPrize[]; treasures: TreasureView[] };

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const res = (v: unknown) => String(v) as MarketPriceResource;

/** Админ клада: Telegram сессии (или кошелька) — из ADMIN_TG_IDS. */
async function requireTreasureAdmin(): Promise<string> {
  const wallet = requireAdmin();
  let tg = getSessionTgId();
  if (!tg) {
    const u = await pg.users.findOne({ wallet }).catch(() => null);
    tg = u && !u.disconnected ? Number(u.telegram_id) : null;
  }
  if (!tg || !treasureAdminIds().includes(tg)) throw new Error("treasure.not_admin");
  return wallet;
}

async function rows(sql: string): Promise<Array<Record<string, unknown>>> {
  return ((await mcpExec(sql, { wrapJson: true })) ?? []) as Array<Record<string, unknown>>;
}

export const getTreasureAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<TreasureAdmin> => {
    await requireTreasureAdmin();
    const [fund, list] = await Promise.all([
      rows(`SELECT f.id, f.resource, f.token, f.amount, f.name,
                   EXISTS (SELECT 1 FROM yuplink.raid_treasure t
                            WHERE t.fund_id = f.id AND t.status = 'live') AS live
              FROM yuplink.raid_treasure_fund f
             WHERE f.used_at IS NULL ORDER BY f.created_at, f.id;`),
      rows(`SELECT t.id, t.slot::text AS slot, t.q, t.r, t.resource, t.token, t.amount, t.name,
                   t.status, t.expires_at, COALESCE(NULLIF(m.name, ''), t.map_id) AS world,
                   (SELECT u.telegram_username FROM yuplink.users u
                     WHERE u.account_id = t.found_by AND u.telegram_username IS NOT NULL
                     LIMIT 1) AS nick
              FROM yuplink.raid_treasure t LEFT JOIN yuplink.raid_maps m ON m.id = t.map_id
             ORDER BY t.slot DESC LIMIT 14;`),
    ]);
    return {
      fund: fund.map((x) => ({
        id: String(x.id),
        resource: res(x.resource),
        token: str(x.token),
        amount: Number(x.amount),
        name: str(x.name),
        live: x.live === true,
      })),
      treasures: list.map((x) => ({
        id: String(x.id),
        date: String(x.slot),
        world: String(x.world),
        q: Number(x.q),
        r: Number(x.r),
        resource: res(x.resource),
        token: str(x.token),
        amount: Number(x.amount),
        name: str(x.name),
        status: String(x.status) as TreasureStatus,
        until: new Date(String(x.expires_at)).toISOString(),
        finder: str(x.nick),
      })),
    };
  },
);

export const addTreasurePrize = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        resource: z.enum(MARKET_PRICE_RESOURCES as [MarketPriceResource, ...MarketPriceResource[]]),
        token: z.string().trim().min(1).max(80).nullable(),
        amount: z.number().positive().max(1e12),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ id: string }> => {
    const wallet = await requireTreasureAdmin();
    const token = prizeNeedsRef(data.resource) ? data.token : null;
    const bad = prizeProblem({ ...data, token });
    if (bad) throw new Error(bad);
    if (isUsdt(token)) throw new Error("treasure.no_usdt");
    let name: string | null = null;
    let image: string | null = null;
    if (data.resource !== "token" && token) {
      const { priceMetaBatch, priceMetaOf } =
        await import("@/server/api/beta-raid/market-payout-meta");
      const meta = priceMetaOf(
        await priceMetaBatch([{ res: data.resource, token }]),
        data.resource,
        token,
      );
      if (!meta) throw new Error("treasure.bad_ref");
      name = meta.name;
      image = meta.image;
    }
    const id = `trf_${nanoid(12)}`;
    const opt = (v: string | null) => (v ? sqlStr(v) : "NULL");
    await mcpExec(
      `INSERT INTO yuplink.raid_treasure_fund (id, resource, token, amount, name, image, created_by)
       VALUES (${sqlStr(id)}, ${sqlStr(data.resource)}, ${opt(token)}, ${data.amount},
               ${opt(name)}, ${opt(image)}, ${sqlStr(wallet)});`,
    );
    return { id };
  });

/** Убрать приз из фонда. Закопанный сейчас — нельзя (его уже ищут). */
export const deleteTreasurePrize = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    await requireTreasureAdmin();
    const gone = (await mcpExec(
      `DELETE FROM yuplink.raid_treasure_fund f
        WHERE f.id = ${sqlStr(data.id)} AND f.used_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM yuplink.raid_treasure t
                           WHERE t.fund_id = f.id AND t.status = 'live')
       RETURNING f.id`,
      { wrapJsonCte: true },
    )) as unknown[];
    if (!Array.isArray(gone) || gone.length === 0) throw new Error("treasure.prize_busy");
    return { ok: true };
  });

/** Скрин клада — data URL для админки. */
export const getTreasureShot = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }): Promise<string | null> => {
    await requireTreasureAdmin();
    const { treasureShot } = await import("./treasure-news");
    const shot = await treasureShot(data.id);
    return shot ? `data:image/jpeg;base64,${shot.toString("base64")}` : null;
  });

/** «Закопать сейчас»: следующий приз фонда — на сутки от запуска (живой клад уже есть — отказ). */
export const buryTreasureNow = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ id: string }> => {
    await requireTreasureAdmin();
    const { buryNow } = await import("./treasure-place");
    return { id: await buryNow() };
  },
);
