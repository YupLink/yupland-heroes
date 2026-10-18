// Маркетплейс фишек (доступен всем подключённым кошелькам).
// Безопасность держится не на роли, а на проверках: продать можно только
// СВОЮ фишку (и она лочится status='listed'), купить — только за свои билеты,
// покупка листинга атомарна (CAS active→sold, гонка двух покупателей исключена).
// Комиссия/статистика маркета остаётся admin-only.
//
// Поток:
//  1. Продавец-админ выставляет фишку: chip → status='listed',
//     создаётся chip_market_listings(active).
//  2. Покупатель-админ платит price_tickets из своих билетов.
//     Создаются три записи в chip_market_ledger:
//        kind='spend'  · wallet=buyer  · amount=price
//        kind='earned' · wallet=seller · amount=price × 0.91
//        kind='fee'    · wallet='_market_fees' · amount=price × 0.09
//     Фишка перетекает в инвентарь покупателя (wallet меняется,
//     status='owned').
//     Listing → status='sold'.
//  3. Отмена листинга — only seller. Возвращает фишку в 'owned'.
//
// Комиссия 9% накапливается на виртуальном кошельке '_market_fees' —
// это запись в БД, никаких блокчейн-движений. Учитывается в
// «Распределение DARAI» через ledger sum.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb, MARKET_FEES_WALLET } from "../db/pg";
import { getCurrentWallet, isAdminWallet } from "../auth";
import { assertNotMaintenance } from "../maintenance";
import { computeTickets, invalidateTicketsCache } from "./user";
import { getSisterWallets } from "./user";
import { CHIP_REST_MS, isChipResting } from "../chipRest";
import { CHIP_STUNNED_KEY, loadStunUntil } from "./chips-market-stun";
import { isPremiumCollection } from "@/lib/tirageBonus";
import { accountOf, accountIdOf } from "./user-shared";
import { noteChipMarketSale } from "./beta-raid/econ/trade-hooks";

const FEE_PERCENT = 9; // 9% комиссия маркета

function requireAdmin(): string {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только админ");
  return w;
}

function requireWallet(): string {
  const w = getCurrentWallet();
  if (!w) throw new Error("Подключи кошелёк");
  assertNotMaintenance(w);
  return w;
}

// ─────────── Сервис-лок Маркета для НОВЫХ игроков ───────────
// Новый игрок (прошёл прихожу, onboarding=true) не может тратить билеты в
// Маркете, пока не купит хотя бы 1 ПАК в магазине (source purchase_*). Старые
// юзеры (onboarding=false) — без ограничений. Всё per-TG (по sister-кошелькам).
// `purchase_account` — пак оплачен со счёта (DARAI/ресурс), тот же поток что
// «purchase_darai», только у него теперь единый счёт. Без этого источника
// новичок покупает пак за 50 000 DARAI, а Маркет всё равно закрыт
// (жалоба «купил пак — маркет пишет что нельзя, надо купить пак»).
const PURCHASE_SOURCES = ["purchase_tickets", "purchase_darai", "purchase_account"];

async function marketLockState(
  account: string
): Promise<{ locked: boolean; isNew: boolean; boughtPack: boolean }> {
  const { data: newRows } = await pg.users
    .raw()
    .select("wallet")
    .eq("account_id", account)
    .eq("hallway_onboarding", true)
    .limit(1);
  const isNew = (newRows?.length ?? 0) > 0;
  if (!isNew) return { locked: false, isNew: false, boughtPack: true };
  const { data: packRows } = await pg.chipPackGrants
    .raw()
    .select("id")
    .eq("account_id", account)
    .in("source", PURCHASE_SOURCES)
    .limit(1);
  const boughtPack = (packRows?.length ?? 0) > 0;
  return { locked: !boughtPack, isNew, boughtPack };
}

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
 * Выставить фишку на продажу. Лочит её (status='listed').
 */
export const adminCreateMarketListing = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        chipId: z.string().min(1),
        priceTickets: z.number().min(0.1).max(1_000_000),
      })
      .parse(d)
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
    // продавать её нельзя — покупатель платит билеты за небоеспособного бойца.
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
      await pg.chipMarketListings.insert({
        id,
        seller_account: account,
        buyer_account: null,
        seller_wallet: wallet,
        chip_id: chip.id,
        price_tickets: data.priceTickets,
        status: "active",
        buyer_wallet: null,
        sold_price_tickets: null,
        created_at: now,
        sold_at: null,
      });
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
    // покупатель платил за неё билеты. А снятие уже проданного лота
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
type ListingRow = {
  id: string;
  chip_id: string;
  seller_wallet: string;
  price_tickets: number;
  created_at: string;
};
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
  const usersRes = await pg.users
    .raw()
    .select("wallet,telegram_username")
    .in("wallet", sellerWallets);
  const users = new Map(
    ((usersRes.data ?? []) as Array<{
      wallet: string;
      telegram_username: string | null;
    }>).map((u) => [u.wallet, u])
  );
  return rows.map((l) => {
    const chip = chips.get(l.chip_id);
    const tpl = chip ? tpls.get(chip.template_id) : undefined;
    return {
      id: l.id,
      chipId: l.chip_id,
      sellerWallet: l.seller_wallet,
      sellerUsername: users.get(l.seller_wallet)?.telegram_username ?? null,
      priceTickets: Number(l.price_tickets),
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
    const valid: ListingRow[] = rows
      .filter((r) => !!r.chip_id)
      .map((r) => ({
        id: r.id,
        chip_id: r.chip_id as string,
        seller_wallet: r.seller_wallet,
        price_tickets: r.price_tickets,
        created_at: r.created_at,
      }));
    return buildListingDisplays(valid);
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
      .select("id,chip_id,seller_wallet,price_tickets,created_at")
      .eq("status", "active")
      .eq("seller_account", listAccount)
      .order("created_at", { ascending: false });
    const rows = (res.data ?? []) as Array<{
      id: string;
      chip_id: string | null;
      seller_wallet: string;
      price_tickets: number;
      created_at: string;
    }>;
    const valid: ListingRow[] = rows
      .filter((r) => !!r.chip_id)
      .map((r) => ({ ...r, chip_id: r.chip_id as string }));
    return buildListingDisplays(valid);
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

/**
 * Сама покупка одного лота — общая для одиночной и групповой покупки
 * (market-batch-buy.ts): сначала деньги, захват лота только если он ещё
 * активен, проиграл захват — билеты назад.
 */
export async function buyListingAs(buyer: string, listingId: string) {
  {
    const l = await pg.chipMarketListings.findOne({ id: listingId });
    if (!l) throw new Error("Листинг не найден");
    if (l.status !== "active") throw new Error("Листинг уже закрыт");
    if (!l.chip_id) throw new Error("Фишка листинга не существует");
    // Анти-абуз: свой же листинг купить нельзя — раньше это ловили списком
    // адресов, теперь ловит аккаунт.
    const buyerAccount = await accountOf(buyer);
    if (l.seller_account === buyerAccount)
      throw new Error("Нельзя купить свой листинг — сними его кнопкой «Снять»");

    // Сервис-лок: новый игрок покупает в Маркете только после покупки пака.
    const lock = await marketLockState(buyerAccount);
    if (lock.locked)
      throw new Error("Купи хотя бы 1 пак в Магазине, чтобы открыть Маркет");

    const price = Number(l.price_tickets);
    const now = new Date().toISOString();
    // Сначала ДЕНЬГИ, потом товар: списываем ДО захвата листинга. Раньше
    // листинг помечался sold, а списание шло после — при отказе фишка
    // зависала (продана, но не передана и не оплачена). moveTickets сам
    // блокирует баланс и не пускает в минус, поэтому отдельная проверка
    // (с 5-секундным кэшем, который пропускал два запроса разом) не нужна.
    const { moveTickets, ticketMoveApplied } = await import("./tickets-ledger");
    // Номер попытки. Проигранный захват возвращает билеты, но ключ списания
    // остаётся занят — и повтор с тем же ключом «применялся» вхолостую:
    // денег не списывали, а фишку отдавали. Каждая новая попытка получает
    // свою пару ключей, поэтому и списание, и возврат остаются честными.
    const payRef = (n: number) => (n === 0 ? `listing:${l.id}:${buyer}` : `listing:${l.id}:${buyer}:a${n}`);
    const undoRef = (n: number) =>
      n === 0 ? `listing-undo:${l.id}:${buyer}` : `listing-undo:${l.id}:${buyer}:a${n}`;
    let attempt = 0;
    while (attempt < 5 && (await ticketMoveApplied("refund", undoRef(attempt)))) attempt++;

    try {
      await moveTickets({
        wallet: buyer,
        delta: -price,
        kind: "market_buy",
        // Кошелёк В КЛЮЧЕ обязателен: списание идёт ДО захвата листинга, и на
        // один лот может податься несколько покупателей. С общим ключом
        // второму списание «применилось бы» вхолостую (идемпотентность), а
        // возврат после проигранного захвата выдал бы ему чужие билеты.
        ref: payRef(attempt),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("not_enough_tickets") || msg.includes("Не хватает")) {
        // ВАЖНО: availableRaw (дробный), НЕ available (floor до целого) —
        // иначе игрок с 0.25 билета видит «у тебя 0.00».
        const have = (await computeTickets(buyer)).availableRaw;
        throw new Error(`Нужно ${price} билетов, у тебя ${have.toFixed(2)}`);
      }
      throw e;
    }
    /** Покупка не состоялась — вернуть деньги покупателю. */
    const undoBuyerDebit = async () => {
      await moveTickets({
        wallet: buyer,
        delta: price,
        kind: "refund",
        ref: undoRef(attempt),
      }).catch((e: unknown) => console.error(`[market] возврат не прошёл ${buyer}:`, e));
    };
    // Атомарный захват листинга: active→sold ТОЛЬКО если он ещё active.
    // При гонке двух покупателей выиграет один запрос, второй получит 0
    // строк и корректную ошибку — без двойных списаний и двойной передачи.
    const { data: claimed, error: claimErr } = await pg.chipMarketListings
      .raw()
      .update({
        status: "sold",
        buyer_account: buyerAccount,
        buyer_wallet: buyer,
        sold_price_tickets: price,
        sold_at: now,
      })
      .eq("id", l.id)
      .eq("status", "active")
      .select();
    if (claimErr) {
      await undoBuyerDebit();
      throw new Error(claimErr.message);
    }
    if (!claimed || claimed.length === 0) {
      await undoBuyerDebit();
      throw new Error("Листинг уже купили — обнови маркет");
    }

    const fee = Math.round((price * FEE_PERCENT) / 100 * 100) / 100;
    const sellerGets = Math.round((price - fee) * 100) / 100;

    // Ledger entries (3 шт).
    await pg.chipMarketLedger.insert({
      id: `mkl_l_${nanoid(8)}`,
      listing_id: l.id,
      wallet: buyer,
      kind: "spend",
      amount_tickets: price,
      created_at: now,
    });
    await pg.chipMarketLedger.insert({
      id: `mkl_l_${nanoid(8)}`,
      listing_id: l.id,
      wallet: l.seller_wallet,
      kind: "earned",
      amount_tickets: sellerGets,
      created_at: now,
    });
    await pg.chipMarketLedger.insert({
      id: `mkl_l_${nanoid(8)}`,
      listing_id: l.id,
      wallet: MARKET_FEES_WALLET,
      kind: "fee",
      amount_tickets: fee,
      created_at: now,
    });

    // Деньги покупателя уже списаны выше — здесь только зачисление продавцу.
    {
      await moveTickets({
        wallet: l.seller_wallet,
        delta: sellerGets,
        kind: "market_sale",
        ref: `listing:${l.id}`,
      });
    }

    // Передача фишки покупателю (листинг уже закрыт CAS-захватом выше).
    // Анти-карусель: покупателю фишка приходит НА ЧАС ОТДЫХА — час её нельзя
    // использовать нигде (бой/крафт/перепродажа/вывод). rest_until = now()+1ч.
    await pg.userChipInventory.update(
      { id: l.chip_id },
      {
        // Владельца пишем явно: если адрес покупателя вдруг не найдётся в
        // users, штамп-триггер оставил бы фишку без хозяина.
        account_id: buyerAccount,
        wallet: buyer,
        status: "owned",
        updated_at: now,
        rest_until: new Date(Date.now() + CHIP_REST_MS).toISOString(),
      }
    );

    // Immutable аудит-снимок сделки — переживёт удаление листинга и
    // сжигание фишки (в отличие от ledger, который SET NULL при удалении).
    // Именно по нему восстановимо «кто у кого купил/продал и сколько».
    try {
      await pg.chipMarketAudit.insert({
        id: `mka_${nanoid(12)}`,
        listing_id: l.id,
        chip_id: l.chip_id,
        seller_wallet: l.seller_wallet,
        buyer_wallet: buyer,
        price_tickets: price,
        seller_got_tickets: sellerGets,
        fee_tickets: fee,
        created_at: now,
      });
    } catch {
      /* аудит не должен ронять покупку — сделка уже прошла */
    }
    // Журнал сделок (панель «$ Экономика»): две строки, покупатель и продавец,
    // контрагент — аккаунт другой стороны. Best-effort, покупку не трогает.
    void noteChipMarketSale({
      listingId: l.id,
      chipId: l.chip_id,
      buyer: buyerAccount,
      seller: l.seller_account,
      price,
      sellerGot: sellerGets,
    });

    // Сбрасываем ticket-кэш у покупателя и продавца (и их sister-кошельков),
    // иначе у них на UI несколько секунд будет старый баланс.
    const [buyerSisters, sellerSisters] = await Promise.all([
      getSisterWallets(buyer),
      getSisterWallets(l.seller_wallet),
    ]);
    invalidateTicketsCache([...buyerSisters, ...sellerSisters]);

    return {
      ok: true,
      pricePaid: price,
      sellerGot: sellerGets,
      commission: fee,
    };
  }
}

/** Лок Маркета для новичка — групповой покупке нужен тот же гард. */
export async function marketLockedFor(wallet: string): Promise<boolean> {
  return (await marketLockState(await accountOf(wallet))).locked;
}

// ─────────── ADMIN: статистика комиссий ───────────

/**
 * Сводка по накопленной комиссии маркета — для отображения
 * в админке (см. распределение DARAI / отдельный счёт).
 */
export const adminGetMarketStats = createServerFn({ method: "GET" }).handler(
  async () => {
    requireAdmin();
    // Суммируем по kind=fee — общий пул комиссии.
    const { data: feeRows } = await pg.chipMarketLedger
      .raw()
      .select("amount_tickets")
      .eq("kind", "fee");
    const totalFees = ((feeRows ?? []) as Array<{ amount_tickets: number }>)
      .reduce((s, r) => s + Number(r.amount_tickets), 0);

    // Кол-во и оборот сделок.
    const { data: soldRows } = await pg.chipMarketListings
      .raw()
      .select("sold_price_tickets")
      .eq("status", "sold");
    const sold = (soldRows ?? []) as Array<{ sold_price_tickets: number }>;
    const turnover = sold.reduce(
      (s, r) => s + Number(r.sold_price_tickets ?? 0),
      0
    );

    // Активные листинги.
    const { data: activeRows } = await pg.chipMarketListings
      .raw()
      .select("id")
      .eq("status", "active");
    const activeCount = ((activeRows ?? []) as Array<{ id: string }>).length;

    return {
      feesWallet: MARKET_FEES_WALLET,
      totalFeesTickets: totalFees,
      feePercent: FEE_PERCENT,
      soldCount: sold.length,
      turnoverTickets: turnover,
      activeListings: activeCount,
    };
  }
);

// ─────────── История фишек игрока (получил/выставил/продал/купил/крафт) ───────────
// Единый таймлайн событий по фишкам аккаунта (по всем sister-кошелькам).
// Чтобы игрок сам видел, куда ушла фишка и за сколько — а не думал «пропала».
export type ChipHistoryEvent = {
  type: "sold" | "bought" | "listed" | "pack" | "craft";
  at: string;
  tickets?: number; // продал получил / купил заплатил / выставил цена / крафт стоил
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
        .select("buyer_wallet,seller_got_tickets,created_at")
        .in("seller_wallet", sisters),
      pg.chipMarketAudit
        .raw()
        .select("seller_wallet,price_tickets,created_at")
        .in("buyer_wallet", sisters),
      pg.chipMarketListings
        .raw()
        .select("price_tickets,status,created_at")
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
    const uname = new Map<string, string>();
    if (cpWallets.size > 0) {
      const { data: uRows } = await pg.users
        .raw()
        .select("wallet,telegram_username")
        .in("wallet", Array.from(cpWallets));
      for (const u of (uRows ?? []) as Array<{
        wallet: string;
        telegram_username: string | null;
      }>)
        if (u.telegram_username) uname.set(u.wallet, u.telegram_username);
    }
    const cp = (w: string) => (uname.get(w) ? `@${uname.get(w)}` : w);

    const ev: ChipHistoryEvent[] = [];
    for (const r of (soldRes.data ?? []) as Array<{
      buyer_wallet: string;
      seller_got_tickets: number;
      created_at: string;
    }>)
      ev.push({
        type: "sold",
        at: r.created_at,
        tickets: Number(r.seller_got_tickets),
        who: cp(r.buyer_wallet),
      });
    for (const r of (boughtRes.data ?? []) as Array<{
      seller_wallet: string;
      price_tickets: number;
      created_at: string;
    }>)
      ev.push({
        type: "bought",
        at: r.created_at,
        tickets: Number(r.price_tickets),
        who: cp(r.seller_wallet),
      });
    for (const r of (listedRes.data ?? []) as Array<{
      price_tickets: number;
      status: string;
      created_at: string;
    }>)
      ev.push({
        type: "listed",
        at: r.created_at,
        tickets: Number(r.price_tickets),
        status: r.status,
      });
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

    ev.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return ev.slice(0, 60);
  }
);

// Пакетное выставление — в своём модуле (§13.1).
export { createMarketListingsBatch } from "./chips-market-batch";
