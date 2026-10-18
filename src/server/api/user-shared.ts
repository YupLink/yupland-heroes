/**
 * user-shared.ts — Общий state, кэши и хелперы.
 * Только чистые функции и типы, БЕЗ createServerFn.
 */
import { pg } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { normalizeTitle } from "@/lib/normalizeTitle";
import { fetchSendlerNftsByOwner, fetchSendlerNftsByTitle } from "../sendler";

const _sisterCache = new Map<string, { value: string[]; at: number }>();
const SISTER_TTL_MS = 60_000;

export function invalidateSisterCache(wallet?: string): void {
  if (wallet) _sisterCache.delete(wallet);
  else _sisterCache.clear();
}

export async function getSisterWallets(wallet: string): Promise<string[]> {
  const cached = _sisterCache.get(wallet);
  if (cached && Date.now() - cached.at < SISTER_TTL_MS) return cached.value;
  const me = await pg.users.findOne({ wallet });
  let sisters: string[];
  if (me?.account_id) {
    sisters = (await pg.users.findMany({ account_id: me.account_id })).map((r) => r.wallet);
  } else if (me?.telegram_id) {
    sisters = (await pg.users.findMany({ telegram_id: me.telegram_id })).map((r) => r.wallet);
  } else {
    sisters = [wallet];
  }
  _sisterCache.set(wallet, { value: sisters, at: Date.now() });
  return sisters;
}

export async function resolveAccountId(wallet: string): Promise<string> {
  const me = await pg.users.findOne({ wallet });
  return me?.account_id ?? wallet;
}

/**
 * ПОДКЛЮЧЁННЫЕ коши аккаунта (без disconnected). В отличие от getSisterWallets
 * (тот включает отключённые ради агрегации АКТИВОВ — фишки/герои остаются при
 * аккаунте после детача), это для НФТ-заработка и дропов: владелец решил, что
 * отвязанный кош перестаёт числиться на аккаунте В МОМЕНТ отвязки — его НФТ
 * сразу не приносят билеты/лайки и не участвуют в дропах. Re-connect вернёт.
 */
export async function getConnectedSisterWallets(wallet: string): Promise<string[]> {
  const me = await pg.users.findOne({ wallet });
  const rows = me?.account_id
    ? await pg.users.findMany({ account_id: me.account_id })
    : me?.telegram_id
      ? await pg.users.findMany({ telegram_id: me.telegram_id })
      : null;
  if (!rows) return [wallet];
  const connected = rows.filter((r) => !r.disconnected).map((r) => r.wallet);
  return connected.length > 0 ? connected : [wallet];
}

/**
 * Аккаунт игрока по ключу — или null, если такого игрока нет.
 *
 * Регистр адреса намеренно не важен: паки, выданные на «player01.tg» игроку
 * «player01.tg», уже один раз повисли ничьими (migrations/acc-08).
 */
export async function accountIdOf(key: string): Promise<string | null> {
  if (key.startsWith("acc_")) {
    const acc = await pg.accounts.findOne({ id: key });
    if (acc) return key;
  }
  const me = await pg.users.findOne({ wallet: key });
  if (me?.account_id) return me.account_id;
  const { data } = await pg.users
    .raw()
    .select("account_id")
    .ilike("wallet", key)
    .not("account_id", "is", null)
    .limit(1);
  return ((data ?? []) as Array<{ account_id: string }>)[0]?.account_id ?? null;
}

/**
 * Аккаунт игрока — обязательный ключ владения. Кидает, если ключ неизвестен:
 * молча вернуть «никого» значит списать или выдать добро в никуда. Для показа
 * есть мягкий accountIdOf — там пустой список честнее ошибки на весь экран.
 */
export async function accountOf(key: string): Promise<string> {
  const acc = await accountIdOf(key);
  if (acc) return acc;
  throw new Error(`Нет аккаунта для ключа ${key}`);
}

export async function getAccountId(wallet: string): Promise<string | null> {
  const me = await pg.users.findOne({ wallet });
  return me?.account_id ?? null;
}

/**
 * Чтение ШТУЧНЫХ активов (PK=id) по владельцу-аккаунту.
 *
 * Раньше здесь читали объединением «аккаунт ∪ кошельки-сёстры»: колонка
 * account_id была не у всех таблиц и не у всех строк. Теперь она есть и
 * заполнена везде, поэтому запасной путь по адресам убран — он же и прятал
 * добро, стоило игроку отвязать кошелёк.
 *
 * build() должен возвращать СВЕЖИЙ select-запрос БЕЗ фильтра владельца
 * (его добавит хелпер): `() => pg.heroInstances.raw().select("*")`.
 */
export async function readOwnedById<T extends { id: string }>(
  wallet: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: () => any,
): Promise<T[]> {
  const accountId = await getAccountId(wallet);
  if (!accountId) return [];
  const res = (await build().eq("account_id", accountId)) as { data: T[] | null };
  return res.data ?? [];
}

export type SendlerLite = { token_id: string; title?: string; media?: string; owner_id?: string };
export type OwnedIndex = Map<string, SendlerLite[]>;
export type InventoryByContract = Map<
  string,
  Array<{ token_id: string; title: string; media: string; owner_id: string }>
>;

export async function buildOwnedIndex(
  pairs: Array<{ contractId: string; title: string }>,
  wallets: string[],
): Promise<OwnedIndex> {
  const index: OwnedIndex = new Map();
  for (const { contractId, title } of pairs) {
    const key = `${contractId}::${normalizeTitle(title)}`;
    if (index.has(key)) continue;
    try {
      const items = await fetchSendlerNftsByTitle(contractId, title);
      index.set(
        key,
        items.filter((it: any) => it.owner_id && wallets.includes(it.owner_id)),
      );
    } catch {
      index.set(key, []);
    }
  }
  return index;
}

export function getOwnedByTitle(
  index: OwnedIndex,
  contractId: string,
  title: string,
): SendlerLite[] {
  return index.get(`${contractId}::${normalizeTitle(title)}`) ?? [];
}

export async function requireLinkedTelegram(wallet: string): Promise<void> {
  const u = await pg.users.findOne({ wallet });
  if (!u?.telegram_id) throw new Error("Привяжи Telegram для этого действия");
}
