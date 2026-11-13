// Счётчик новых (непросмотренных) лотов аукциона — для значка на кнопке
// «Торговля» и у пункта «Аукционы» (фронт, 26.10.2026). Игрок = аккаунт
// серверной сессии: отметки общие для всех его устройств. Таблица —
// yuplink.auction_seen (migrations/auction-seen-01.sql), условия — seen-sql.ts.
// Отказы — ключами словаря (translations/common.ts), их переводит humanError.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { getCurrentWallet } from "../../auth";
import { accAccountId } from "../currency/move";
import { SEEN_MAX_IDS, markSeenSql, unreadCountSql } from "./seen-sql";

export type AuctionUnread = { unreadCount: number };

export const markSeenInput = z.object({
  auctionIds: z.array(z.string().min(1).max(100)).max(SEEN_MAX_IDS),
});

/** Аккаунт текущей сессии (как у listAuctions/placeBid); без входа — null. */
async function sessionAccount(): Promise<string | null> {
  const wallet = getCurrentWallet();
  return wallet ? await accAccountId(wallet).catch(() => null) : null;
}

async function countUnread(accountId: string): Promise<number> {
  const rows = (await mcpExec(unreadCountSql(accountId), { wrapJson: true })) as Array<{
    n: number | string;
  }>;
  return Number(rows?.[0]?.n ?? 0) || 0;
}

/** Сколько действующих чужих лотов игрок ещё не видел. Без входа — 0. */
export const getAuctionUnread = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuctionUnread> => {
    const accountId = await sessionAccount();
    if (!accountId) return { unreadCount: 0 };
    try {
      return { unreadCount: await countUnread(accountId) };
    } catch (e) {
      console.warn("[auction] счётчик новых лотов:", e);
      throw new Error("err.auction_seen_failed");
    }
  },
);

/**
 * Отметить показанные игроку лоты. Идемпотентно; несуществующие, завершённые
 * id и свои лоты игрока молча пропускаются. Ответ — свежий счётчик.
 */
export const markAuctionsSeen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => markSeenInput.parse(d))
  .handler(async ({ data }): Promise<AuctionUnread> => {
    const accountId = await sessionAccount();
    if (!accountId) throw new Error("err.auction_seen_login");
    try {
      const sql = markSeenSql(accountId, data.auctionIds);
      if (sql) await mcpExec(sql, { wrapJson: false });
      return { unreadCount: await countUnread(accountId) };
    } catch (e) {
      console.warn("[auction] отметка просмотра лотов:", e);
      throw new Error("err.auction_seen_failed");
    }
  });
