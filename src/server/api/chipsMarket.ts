// Маркетплейс фишек. С 21.10.2026 снова открыт — за ЗОЛОТО (владелец; ПРАВИЛА §8.61
// закрыл его 20.10 вместе с билетами). Правила цены и комиссии — chips-market-gold.ts.
//
// Поток:
//  1. Продавец выставляет фишку: chip → status='listed', создаётся
//     chip_market_listings(active) с ценой в price_gold (целое золото от 200).
//  2. Покупатель платит золотом (chips-market-buy.ts; пачкой — market-batch-buy.ts).
//     Три записи в chip_market_ledger (amount_gold; amount_tickets = 0):
//        kind='spend'  · wallet=buyer  · amount=price
//        kind='earned' · wallet=seller · amount=price × 0.91
//        kind='fee'    · wallet='_market_fees' · amount=price × 0.09 (сгорает)
//     Фишка перетекает в инвентарь покупателя на час отдыха. Listing → 'sold'.
//  3. Отмена листинга — only seller. Возвращает фишку в 'owned'.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { getCurrentWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { getSisterWallets } from "./user";
import { isChipResting } from "../chipRest";
import { CHIP_STUNNED_KEY, loadStunUntil } from "./chips-market-stun";
import { isPremiumCollection } from "@/lib/tirageBonus";
import { accountOf, accountIdOf } from "./user-shared";
import { marketLockState } from "./chips-market-lock";
import { buyListingAs } from "./chips-market-buy";
import {
  goldOrTickets,
  goldPriceSchema,
  insertGoldListing,
  listingGoldPrice,
  requireGoldPrice,
} from "./chips-market-gold";
import { walletLabels } from "@/server/api/player-name/player-name-labels";

function requireWallet(): string {
  const w = getCurrentWallet();
  if (!w) throw new Error("Подключи кошелёк");
  assertNotMaintenance(w);
  return w;
}

// Сервис-лок Маркета для новых игроков — chips-market-lock.ts.
/** Статус доступа к Маркету для текущего игрока (для UI-лока). */
export const getMarketAccess = createServerFn({ method: "GET" }).handler(
  async () => {
    const w = getCurrentWallet();
    if (!w) return { locked: false, isNew: false, boughtPack: true };
    const acc = await accountIdOf(w);
    if (!acc) return { locked: false, isNew: false, boughtPack: true };
    return marketLockState(acc);
  }
);

// ─────────── create / cancel listing (владелец фишки) ───────────

/**
 * Выставить фишку на продажу за золото. Лочит её (status='listed').
 */
export const adminCreateMarketListing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ chipId: z.string().min(1), priceGold: goldPriceSchema }).parse(requireGoldPrice(d))
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const account = await accountOf(wallet);
    const chip = await pg.userChipInventory.findOne({ id: data.chipId });
    if (!chip) throw new Error("Фишка не найдена");
    if (chip.account_id !== account) throw new Error("Это не твоя фишка");
    if (chip.status !== "owned")
      throw new Error(`Фишка занята (status=${chip.status})`);
    // Анти-карусель: отдыхающую (только что полученную передачей) фишку нельзя
    // сразу перепродать — иначе карусель крутится быстрее часа.
    if (isChipResting(chip.rest_until))
      throw new Error("Фишка отдыхает после передачи — продать можно через час");
    // Оглушённая боссом фишка «без сознания»: в бой не выходит, значит и
    // продавать её нельзя — покупатель платит за небоеспособного бойца.
    if ((await loadStunUntil([chip.id])).size > 0) throw new Error(CHIP_STUNNED_KEY);

    const id = `mkl_${nanoid(10)}`;
    const now = new Date().toISOString();

    // Лочим фишку CAS-ом (owned→listed) — атомарно, чтобы одну фишку нельзя
    // было параллельно выставить И на маркет, И в PvP (двойной спенд). Если
    // 0 строк — фишка уже занята другой операцией (гонка).
    const { data: casLock, error: casErr } = await sb
      .from("user_chip_inventory")
      .update({ status: "listed", updated_at: now })
      .eq("id", chip.id)
      .eq("status", "owned")
      .select("id");
    if (casErr) throw new Error(`Не удалось выставить фишку: ${casErr.message}`);
    if (!casLock || casLock.length === 0)
      throw new Error("Фишка сейчас занята (гонка) — обнови и попробуй ещё раз");
    try {
      await insertGoldListing({ id, account, wallet, chipId: chip.id, priceGold: data.priceGold, now });
    } catch (e) {
      // Откат лока — фишка возвращается в инвентарь.
      await pg.userChipInventory.update(
        { id: chip.id },
        { status: "owned", updated_at: new Date().toISOString() }
      );
      throw new Error(
        "Не удалось выставить фишку — попробуй ещё раз (фишка на месте)"
      );
    }

    return { ok: true, listingId: id };
  });

/**
 * Снять листинг с продажи. Возвращает фишку в 'owned'.
 */
export const adminCancelMarketListing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ listingId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    const l = await pg.chipMarketListings.findOne({ id: data.listingId });
    if (!l) throw new Error("Листинг не найден");
    // Листинг принадлежит аккаунту: смена адреса не запирает фишку в listed.
    if (l.seller_account !== (await accountOf(wallet)))
      throw new Error("Не твой листинг");
    if (l.status !== "active") throw new Error("Листинг уже не активен");
    if (!l.chip_id) throw new Error("Фишка листинга не существует");

    const now = new Date().toISOString();
    // Порядок и CAS: сперва гасим ЛОТ (active→cancelled) и только потом
    // отпускаем фишку. Раньше было наоборот и без условия: фишка становилась
    // свободной при ещё активном лоте — её можно было сжечь в крафте, пока
    // покупатель платил за неё. А снятие уже проданного лота
    // переписывало ему статус.
    const { data: closed } = await pg.chipMarketListings
      .raw()
      .update({ status: "cancelled" })
      .eq("id", l.id)
      .eq("status", "active")
      .select();
    if (!closed || closed.length === 0)
      throw new Error("Лот уже закрыт — обнови маркет");
    await pg.userChipInventory
      .raw()
      .update({ status: "owned", updated_at: now })
      .eq("id", l.chip_id)
      .eq("status", "listed");
    return { ok: true };
  });

// ─────────── PUBLIC: list / buy ───────────

// Батч-сборка отображений листингов: bulk-fetch фишек/шаблонов/продавцов
// (3 запроса на ЛЮБУЮ пачку), а не 3 запроса на КАЖДЫЙ листинг. Это и есть
// причина, по которой раньше стоял лимит 100 (иначе N+1 тормозил). С батчем
// можно отдавать ВСЕ активные листинги.
// Только лоты за золото: старые (в билетах) золотом не продаются и не показываются.
type ListingRow = {
  id: string;
  chip_id: string;
  seller_wallet: string;
  price_gold: number;
  created_at: string;
};
const goldRows = (rows: Array<{ id: string; chip_id: string | null; seller_wallet: string; created_at: string }>) =>
  rows.flatMap((r): ListingRow[] => {
    const price = listingGoldPrice(r);
    return r.chip_id && price != null ? [{ ...r, chip_id: r.chip_id, price_gold: price }] : [];
  });
async function buildListingDisplays(rows: ListingRow[]) {
  if (rows.length === 0) return [];
  const chipIds = Array.from(new Set(rows.map((r) => r.chip_id)));
  const sellerWallets = Array.from(new Set(rows.map((r) => r.seller_wallet)));
  const chipsRes = await pg.userChipInventory
    .raw()
    .select("id,level,serial_no,template_id,collection_id")
    .in("id", chipIds);
  const chips = new Map(
    ((chipsRes.data ?? []) as Array<{
      id: string;
      level: number;
      serial_no: number | null;
      template_id: string;
      collection_id: string;
    }>).map((c) => [c.id, c])
  );
  const colIds = Array.from(
    new Set(Array.from(chips.values()).map((c) => c.collection_id).filter(Boolean))
  );
  const colRes = await pg.chipCollections
    .raw()
    .select("id,name,initial_supply,is_premium")
    .in("id", colIds.length ? colIds : ["__none__"]);
  const cols = new Map(
    ((colRes.data ?? []) as Array<{
      id: string;
      name: string;
      initial_supply: number;
      is_premium: boolean;
    }>).map((c) => [c.id, c])
  );
  const tplIds = Array.from(
    new Set(Array.from(chips.values()).map((c) => c.template_id))
  );
  const tplRes = await pg.chipTemplates
    .raw()
    .select("id,name,image_url,template_no")
    .in("id", tplIds.length ? tplIds : ["__none__"]);
  const tpls = new Map(
    ((tplRes.data ?? []) as Array<{
      id: string;
      name: string;
      image_url: string | null;
      template_no: number | null;
    }>).map((tt) => [tt.id, tt])
  );
  // Подпись продавца: своё имя из профиля, иначе @ник (player-name).
  const labels = await walletLabels(sellerWallets);
  // Telegram-номер продавца наружу не отдаём (publicWallet, аудит 11.11.2026).
  const { publicWallet } = await import("../publicWallet");
  const pub = new Map(
    await Promise.all(sellerWallets.map(async (w) => [w, await publicWallet(w)] as const)),
  );
  return rows.map((l) => {
    const chip = chips.get(l.chip_id);
    const tpl = chip ? tpls.get(chip.template_id) : undefined;
    return {
      id: l.id,
      chipId: l.chip_id,
      sellerWallet: pub.get(l.seller_wallet) ?? l.seller_wallet,
      /** Готовая подпись: своё имя или «@ник»; нет — null (клиент покажет кошелёк). */
      sellerUsername: labels.get(l.seller_wallet) ?? null,
      priceGold: Number(l.price_gold),
      collectionId: chip?.collection_id ?? null,
      collectionName: chip ? cols.get(chip.collection_id)?.name ?? null : null,
      chip: {
        id: l.chip_id,
        level: chip?.level ?? 0,
        name: tpl?.name ?? "",
        imageUrl: tpl?.image_url ?? null,
        templateNo: tpl?.template_no ?? null,
        serialNo: chip?.serial_no ?? null,
        tirage: chip ? cols.get(chip.collection_id)?.initial_supply ?? null : null,
        // Премиум — тем же АЛГОРИТМОМ, что инвентарь/бой (имя «premium» ИЛИ флаг),
        // иначе на маркете буст не показывался у премиум-коллекций без ручного
        // флага, хотя в инвентаре он есть. См. isPremiumCollection.
        isPremium: chip
          ? isPremiumCollection(
              cols.get(chip.collection_id)?.name,
              cols.get(chip.collection_id)?.is_premium
            )
          : false,
      },
      createdAt: l.created_at,
    };
  });
}

/** Все активные листинги (всем). Без лимита — витрина отдаёт всё, фронт
 *  рендерит порциями по 20 при скролле. */
export const listMarketListings = createServerFn({ method: "GET" }).handler(
  async () => {
    const rows = await pg.chipMarketListings.findMany(
      { status: "active" },
      { orderBy: { column: "created_at", ascending: false }, limit: 2000 }
    );
    // active-листинг без фишки (chip_id=NULL) быть не должен — на всякий
    // случай не показываем «мёртвые».
    return buildListingDisplays(goldRows(rows));
  }
);

/**
 * МОИ активные листинги — по всем sister-кошелькам, БЕЗ лимита.
 * Раньше вкладка «Мои» фильтровала обрезанную до 100 глобальную выдачу на
 * клиенте → у кого листинги старше топ-100 (напр. 83 листинга, в окно попал
 * 21) счётчик занижался и свои листинги не показывались. Здесь фильтруем по
 * продавцу на сервере, поэтому видно ВСЕ свои листинги.
 */
export const listMyMarketListings = createServerFn({ method: "GET" }).handler(
  async () => {
    const wallet = getCurrentWallet();
    if (!wallet) return [];
    const listAccount = await accountIdOf(wallet);
    if (!listAccount) return [];
    const res = await pg.chipMarketListings
      .raw()
      .select("id,chip_id,seller_wallet,price_gold,created_at")
      .eq("status", "active")
      .eq("seller_account", listAccount)
      .order("created_at", { ascending: false });
    const rows = (res.data ?? []) as Array<{
      id: string;
      chip_id: string | null;
      seller_wallet: string;
      price_gold: number | string | null;
      created_at: string;
    }>;
    return buildListingDisplays(goldRows(rows));
  }
);

/**
 * Купить листинг. Списывает цену с покупателя, кладёт 91% продавцу,
 * 9% — комиссия маркета. Фишка переходит в инвентарь покупателя.
 */
export const buyMarketListing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ listingId: z.string().min(1) }).parse(d)
  )
  .handler(async ({ data }) => buyListingAs(requireWallet(), data.listingId));

// Покупка одного лота — chips-market-buy.ts; сводка комиссии для админки —
// chips-market-stats.ts (золото у новых лотов, билеты — у старых).
export { adminGetMarketStats } from "./chips-market-stats";

// ─────────── История фишек игрока (получил/выставил/продал/купил/крафт) ───────────
// Единый таймлайн событий по фишкам аккаунта (по всем sister-кошелькам).
// Чтобы игрок сам видел, куда ушла фишка и за сколько — а не думал «пропала».
export type ChipHistoryEvent = {
  type: "sold" | "bought" | "listed" | "pack" | "craft";
  at: string;
  tickets?: number; // продал получил / купил заплатил / выставил цена / крафт стоил
  gold?: number; // крафт за золото (§8.60); маркет — лоты за золото (с 21.10)
  who?: string; // контрагент (@username или кошелёк)
  status?: string; // для listed: active/sold/cancelled
  count?: number; // для pack: сколько фишек выпало
};

export const getMyChipHistory = createServerFn({ method: "GET" }).handler(
  async (): Promise<ChipHistoryEvent[]> => {
    const wallet = getCurrentWallet();
    if (!wallet) return [];
    const histAccount = await accountIdOf(wallet);
    if (!histAccount) return [];
    // Аудит сделок ключуется адресами (это история контрагентов), поэтому для
    // него по-прежнему нужен список адресов игрока; всё остальное — по аккаунту.
    const sisters = await getSisterWallets(wallet);

    const [soldRes, boughtRes, listedRes, packRes, craftRes] = await Promise.all([
      pg.chipMarketAudit
        .raw()
        .select("buyer_wallet,seller_got_tickets,seller_got_gold,created_at")
        .in("seller_wallet", sisters),
      pg.chipMarketAudit
        .raw()
        .select("seller_wallet,price_tickets,price_gold,created_at")
        .in("buyer_wallet", sisters),
      pg.chipMarketListings
        .raw()
        .select("price_tickets,price_gold,status,created_at")
        .eq("seller_account", histAccount)
        .order("created_at", { ascending: false })
        .limit(60),
      pg.chipPackGrants
        .raw()
        .select("result_chips,opened_at")
        .eq("account_id", histAccount)
        .not("opened_at", "is", null)
        .order("opened_at", { ascending: false })
        .limit(60),
      pg.chipCraftTicketSpend
        .raw()
        .select("amount,created_at")
        .eq("account_id", histAccount)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);

    // Резолвим @username контрагентов (покупатель/продавец).
    const cpWallets = new Set<string>();
    for (const r of (soldRes.data ?? []) as Array<{ buyer_wallet: string }>)
      cpWallets.add(r.buyer_wallet);
    for (const r of (boughtRes.data ?? []) as Array<{ seller_wallet: string }>)
      cpWallets.add(r.seller_wallet);
    const uname = await walletLabels(Array.from(cpWallets));
    const cp = (w: string) => uname.get(w) ?? w;

    const ev: ChipHistoryEvent[] = [];
    // Сделки и лоты за золото (с 21.10) — в золоте, прежние — в билетах.
    for (const r of (soldRes.data ?? []) as Array<{
      buyer_wallet: string;
      seller_got_tickets: number;
      seller_got_gold: number | null;
      created_at: string;
    }>)
      ev.push({
        type: "sold",
        at: r.created_at,
        ...goldOrTickets(r.seller_got_gold, r.seller_got_tickets),
        who: cp(r.buyer_wallet),
      });
    for (const r of (boughtRes.data ?? []) as Array<{
      seller_wallet: string;
      price_tickets: number;
      price_gold: number | null;
      created_at: string;
    }>)
      ev.push({
        type: "bought",
        at: r.created_at,
        ...goldOrTickets(r.price_gold, r.price_tickets),
        who: cp(r.seller_wallet),
      });
    for (const r of (listedRes.data ?? []) as Array<{
      price_tickets: number;
      price_gold: number | null;
      status: string;
      created_at: string;
    }>)
      ev.push({ type: "listed", at: r.created_at, ...goldOrTickets(r.price_gold, r.price_tickets), status: r.status });
    for (const r of (packRes.data ?? []) as Array<{
      result_chips: unknown;
      opened_at: string;
    }>) {
      let arr: unknown = r.result_chips;
      if (typeof arr === "string") {
        try {
          arr = JSON.parse(arr);
        } catch {
          arr = [];
        }
      }
      ev.push({
        type: "pack",
        at: r.opened_at,
        count: Array.isArray(arr) ? arr.length : 0,
      });
    }
    for (const r of (craftRes.data ?? []) as Array<{
      amount: number;
      created_at: string;
    }>)
      ev.push({ type: "craft", at: r.created_at, tickets: Number(r.amount) });
    const { craftGoldEvents } = await import("./chip-history-gold");
    for (const r of await craftGoldEvents(histAccount))
      ev.push({ type: "craft", at: r.at, gold: r.gold });

    ev.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return ev.slice(0, 60);
  }
);

// Пакетное выставление — в своём модуле (§13.1).
export { createMarketListingsBatch } from "./chips-market-batch";
