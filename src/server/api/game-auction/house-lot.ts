// Лот игрока: выставить и снять. Порядок выставления — бронь слота (SQL
// auction_house_open, лот в 'escrow') → вещь в залог (escrow.ts) → лот в
// 'live'. Ключ лота — от нажатия (opId): повтор доводит ту же бронь, а не
// заводит вторую. Обрыв посередине дочищает сторож (settle-player.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { freeAuctionArtCount } from "./lot-arts";
import { ensureAuctionSchema, AUCTION_DURATIONS } from "./schema";
import { takeEscrow, type EscrowInfo, type EscrowLot } from "./escrow";
import { settlePlayerLot } from "./settle-player";
import { houseLevel, humanHouseError, sellableGoods, who } from "./house";
import {
  CURRENCY_LEVEL,
  PLAYER_DURATIONS,
  PLAYER_LOT_KINDS,
  STARS_LEVEL,
  houseCurrencies,
} from "@/lib/auctionHouse";
import { isWholeOnlyCurrency } from "@/lib/auctionCurrency";
import { isWalletLinked } from "@/lib/walletLinked";
import { parseArtLotRef } from "@/lib/auctionArtRef";
import { googleOnlyWallet } from "@/lib/auth/entryRules";

const RESOURCES = ["gold", "stone", "wood", "diamonds"];

async function statusOf(id: string): Promise<string | null> {
  const rows = (await mcpExec(`SELECT status FROM yuplink.auction WHERE id = ${sqlStr(id)};`, {
    wrapJson: true,
  })) as Array<{ status: string }>;
  return rows?.[0]?.status ?? null;
}

export const createPlayerLot = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(PLAYER_LOT_KINDS),
        // resource — gold/stone/…; artifact — шаблон; custom — ключ стека рюкзака.
        ref: z.string().min(1).max(80),
        qty: z.number().int().min(1).max(1_000_000),
        currency: z.string().min(1).max(20),
        startPrice: z.number().positive(),
        duration: z.enum(PLAYER_DURATIONS),
        opId: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { wallet, account } = await who();
    // Должник: золото за монеты не продаёт (§8.129), только за ресурсы.
    if (data.kind === "resource" && data.ref === "gold" && !data.currency.startsWith("res:"))
      await (await import("../debt/debt-read")).assertNoDebt(account, "debt.goldSwapClosed");
    await ensureAuctionSchema();
    // Валюта — по уровню дома (владелец, 14.10): золото с 1-го … USDT с 10-го.
    const level = await houseLevel(account);
    if (level < 1) throw new Error(humanHouseError("house_needed"));
    // «Только Google» (§8.127): продаёт только за золото.
    if (googleOnlyWallet(wallet) && data.currency !== "res:gold") throw new Error("google.goldOnly");
    if (!houseCurrencies(level, isWalletLinked(wallet)).includes(data.currency)) {
      if (data.currency === "STARS" && isWalletLinked(wallet)) {
        throw new Error("Звёзды — для игроков без кошелька");
      }
      const need = data.currency === "STARS" ? STARS_LEVEL : CURRENCY_LEVEL[data.currency];
      throw new Error(
        need ? `Эта валюта откроется на ${need}-м уровне дома` : "За эту валюту дом не продаёт",
      );
    }
    if (isWholeOnlyCurrency(data.currency) && !Number.isInteger(data.startPrice)) {
      throw new Error("Энергия и ресурсы — только целым числом");
    }

    let prizeRef = data.ref;
    let title: string | null = null;
    let escrow: EscrowInfo = {};
    if (data.kind === "resource") {
      if (!RESOURCES.includes(data.ref)) throw new Error("Неизвестный ресурс");
      if (data.currency === `res:${data.ref}`)
        throw new Error("Ресурс за тот же ресурс не продаётся");
    } else if (data.kind === "artifact") {
      // Группа пикера — шаблон и износ: в залог и победителю уходят такие же.
      const art = parseArtLotRef(data.ref);
      const free = await freeAuctionArtCount(account, art);
      if (free < data.qty) throw new Error("Нет столько свободных артефактов");
      prizeRef = art.templateId;
      escrow = { wear: art.wear, enchant: art.enchantPct };
    } else {
      const bag = await sellableGoods(wallet);
      const g = bag.goods.find((x) => x.stackKey === data.ref);
      if (!bag.heroId || !g) throw new Error("Этого товара нет в рюкзаке героя");
      if (g.max < data.qty) throw new Error(`В рюкзаке только ${g.max}`);
      prizeRef = g.refId;
      title = g.name;
      escrow = { heroId: bag.heroId, stackKey: g.stackKey, image: g.image };
    }

    const id = `gaucp_${data.opId}`;
    const { data: opened, error } = await sb.rpc("auction_house_open", {
      p_account: account,
      p_wallet: wallet,
      p_auction: id,
      p_kind: data.kind,
      p_ref: prizeRef,
      p_qty: data.qty,
      p_title: title,
      p_currency: data.currency,
      p_start: data.startPrice,
      p_hours: AUCTION_DURATIONS[data.duration],
      p_escrow: escrow,
    });
    if (error) throw new Error(humanHouseError(String(error.message ?? "")));
    // Скаляр функции: напрямую — строкой, через шим моста — строкой в первой колонке.
    const res = Array.isArray(opened) ? Object.values(opened[0] ?? {})[0] : opened;
    if (res === "duplicate") {
      const st = await statusOf(id);
      if (st === "live") return { ok: true, id };
      if (st !== "escrow") throw new Error("Лот не выставлен — попробуй ещё раз");
    }

    const lot: EscrowLot = {
      id,
      title,
      prize_kind: data.kind,
      prize_ref: prizeRef,
      prize_qty: data.qty,
      seller_account_id: account,
      seller_wallet: wallet,
      escrow,
    };
    // Сбой базы посреди взятия летит наверх: бронь дочистит сторож (вернёт, если взяли).
    const took = await takeEscrow(lot);
    if (!took.ok) {
      await mcpExec(
        `UPDATE yuplink.auction SET status = 'void', closed_at = now(), item_returned = true
          WHERE id = ${sqlStr(id)} AND status = 'escrow';`,
        { wrapJson: false },
      );
      throw new Error("Не хватает — столько уже нет");
    }
    const snap = took.snap ? sqlStr(JSON.stringify({ snap: took.snap })) : "'{}'";
    const live = (await mcpExec(
      `UPDATE yuplink.auction
          SET status = 'live', escrow = COALESCE(escrow, '{}'::jsonb) || ${snap}::jsonb,
              end_at = now() + (end_at - start_at), start_at = now()
        WHERE id = ${sqlStr(id)} AND status = 'escrow'
      RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (live?.[0]) return { ok: true, id };
    if ((await statusOf(id)) === "live") return { ok: true, id };
    // Бронь успели снять (сторож) — вещь назад.
    await settlePlayerLot(id).catch(() => undefined);
    throw new Error("Лот не выставлен — вещь вернулась");
  });

/** Снять свой лот — пока на нём нет ставок. Вещь возвращается сразу. */
export const cancelPlayerLot = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ auctionId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { account } = await who();
    await ensureAuctionSchema();
    // Под замком строки: ставка, пришедшая раньше, проставит top_bid_id, и
    // условие не сработает; после — функция ставки увидит «закрыт».
    const done = (await mcpExec(
      `UPDATE yuplink.auction SET status = 'cancelled', closed_at = now()
        WHERE id = ${sqlStr(data.auctionId)} AND seller_account_id = ${sqlStr(account)}
          AND status = 'live' AND top_bid_id IS NULL
      RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (!done?.[0]) throw new Error("Снять можно только свой лот без ставок");
    await settlePlayerLot(data.auctionId);
    return { ok: true };
  });
