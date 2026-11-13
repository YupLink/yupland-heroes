// Кошелёк и сессия — только при проверенном Telegram (владелец, 18.10.2026:
// «войти и добавить кошелёк можно, только если подключён Telegram; без подписи —
// никак, чтобы не было прецедентов»).
//
// Раньше connectWallet сажал сессию на любой кошелёк без Telegram, назвав его
// имя, — так «держался» вход под darai_collection.near, и так же его мог занять
// кто угодно. А кука «добавляю кошелёк к Telegram» лежала в браузере без подписи:
// подменив её, можно было пристегнуть свой кошелёк к чужому Telegram.
//
// Теперь Telegram берётся только из подписанной сессии (auth.ts, wallet#tgId) или
// из проверенного initData мини-аппа:
//  · без подписи — только пересесть на кошелёк, УЖЕ привязанный к этому Telegram;
//  · новый кошелёк — только с подписью (NEP-413, connectWalletSigned): он
//    пристёгивается к Telegram сессии; чужой Telegram — отказ.
import { pg } from "../db/pg";
import { isAdminWalletLinked, setCurrentWallet } from "../auth";
import { isGoogleOnlyTg } from "@/lib/auth/googleTg";

/**
 * Google-аккаунту кошелёк не привязывается (владелец, 09.11.2026: «к гуглу кошелька
 * не привязать»): с блокчейном он не связан никак — ни ввода, ни вывода.
 */
export function assertWalletLinkAllowed(tg: number | null | undefined): void {
  if (isGoogleOnlyTg(tg)) throw new Error("google.noWallet");
}

/**
 * Тип коша и где хранится ключ — по имени (детерминированно). Кош = атрибут
 * аккаунта: помечаем, что он есть и где живёт ключ. telegram — это сама личность
 * (ключа нет), embedded — наш кош с ключом на устройстве, hot — HOT Wallet,
 * external — внешний NEAR-кош.
 */
export function deriveWalletKind(wallet: string): { kind: string; storage: string | null } {
  if (/^tg\d+$/.test(wallet)) return { kind: "telegram", storage: null };
  if (/^i\d+\.tg$/.test(wallet)) return { kind: "embedded", storage: "device" };
  if (wallet.endsWith(".tg")) return { kind: "hot", storage: "hot_app" };
  return { kind: "external", storage: "external_app" };
}

const NOT_LINKED = "Кошелёк не привязан к твоему Telegram — добавь его с подписью";

/**
 * Без подписи: сессия на кошелёк, который уже привязан к этому Telegram и не
 * отключён. sameAccountAs — авто-восстановление коннектора: только кошелёк того
 * же аккаунта, иначе коннектор молча уводил бы игрока в другой аккаунт Telegram.
 */
export async function switchToLinkedWallet(
  wallet: string,
  tg: number,
  opts: { sameAccountAs?: string | null } = {},
): Promise<{ wallet: string }> {
  const w = wallet.toLowerCase();
  const row = await pg.users.findOne({ wallet: w });
  if (!row || Number(row.telegram_id) !== tg || row.disconnected) throw new Error(NOT_LINKED);
  // Админский кошелёк (владелец, 21.10.2026: «к darai_collection может подключаться
  // не один аккаунт — это админский кош») — из любого аккаунта этого же Telegram.
  if (opts.sameAccountAs && !(await isAdminWalletLinked(w))) {
    const cur = await pg.users.findOne({ wallet: opts.sameAccountAs });
    if (!cur?.account_id || cur.account_id !== row.account_id) throw new Error(NOT_LINKED);
  }
  setCurrentWallet(w, tg);
  return { wallet: w };
}

/**
 * Кошелёк доказан подписью: пристегнуть к Telegram сессии (если ещё ни к кому) и
 * пересадить сессию на него. Привязан к другому Telegram — отказ. Без реферала и
 * стартового набора: это второй кошелёк уже известного игрока.
 */
export async function linkSignedWallet(
  wallet: string,
  tg: number,
  opts: { stay?: boolean } = {},
): Promise<{ wallet: string }> {
  assertWalletLinkAllowed(tg);
  const w = wallet.toLowerCase();
  const row = await pg.users.findOne({ wallet: w });
  if (row?.telegram_id && Number(row.telegram_id) !== tg) {
    // Номер входа по кошельку (06.11.2026) — не Telegram: уступает настоящему.
    const { isWalletTg } = await import("@/lib/auth/googleTg");
    if (!isWalletTg(row.telegram_id)) throw new Error("Этот кошелёк привязан к другому Telegram");
    const { releaseWalletTg } = await import("./wallet-login/walletLoginStore");
    await releaseWalletTg(Number(row.telegram_id), tg);
    const { adoptTelegramAccount } = await import("./user-account-adopt");
    await adoptTelegramAccount(tg).catch(() => {});
  }
  const now = new Date().toISOString();
  // findFirst: у одного Telegram несколько кошельков, findOne на них падает.
  const me = await pg.users.findFirst({ telegram_id: tg });
  if (!row) {
    const wk = deriveWalletKind(w);
    await pg.users.insert({
      wallet: w,
      telegram_id: tg,
      telegram_username: me?.telegram_username ?? null,
      telegram_linked_at: now,
      referred_by: null,
      hallway_onboarding: false,
      wallet_kind: wk.kind,
      wallet_storage: wk.storage,
    });
  } else {
    await pg.users.update(
      { wallet: w },
      {
        telegram_id: tg,
        telegram_username: row.telegram_username ?? me?.telegram_username ?? null,
        telegram_linked_at: row.telegram_id ? row.telegram_linked_at : now,
        disconnected: false,
      },
    );
  }
  // Перечитываем: параллельная привязка к другому Telegram не должна пройти молча.
  const after = await pg.users.findOne({ wallet: w });
  if (Number(after?.telegram_id) !== tg)
    throw new Error("Этот кошелёк привязан к другому Telegram");
  // Кошелёк принёс с собой второй аккаунт этого Telegram — по правилу владельца
  // (06.11.2026) остаётся тот, где больше ресурсов, второй уходит в архив.
  const { oneAccountPerTg } = await import("../accountArchive");
  await oneAccountPerTg(tg, "wallet-link").catch((e) =>
    console.warn("[one-per-tg]", e instanceof Error ? e.message : e),
  );
  // stay — только пристегнуть (новый кошелёк в «Моём кошельке»), игра остаётся на прежнем.
  if (!opts.stay) setCurrentWallet(w, tg);
  return { wallet: w };
}
