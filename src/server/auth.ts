import { getCookie, setCookie } from "@tanstack/react-start/server";
import { signCookieValue, readSignedCookieValue } from "./sessionCookie";

const COOKIE = "gd_wallet";
const ACC_COOKIE = "gd_acc";

// Сессия = кошелёк + ПРОВЕРЕННЫЙ Telegram (владелец, 18.10.2026: вход и
// добавление кошелька — только при подключённом Telegram, без подписи — никак).
// В подписанной cookie лежит `wallet#tgId`: tgId попадает туда только из
// проверенного входа (initData мини-аппа, виджет Telegram) или из прошлой такой
// сессии. Старый формат без tgId (сессии «просто кошельком») недействителен.
type Session = { wallet: string; tgId: number };

function readSession(): Session | null {
  const v = readSignedCookieValue(getCookie(COOKIE) ?? null);
  if (!v) return null;
  const at = v.lastIndexOf("#");
  if (at <= 0) return null;
  const tgId = Number(v.slice(at + 1));
  if (!Number.isSafeInteger(tgId) || tgId <= 0) return null;
  return { wallet: v.slice(0, at), tgId };
}

/** Проверенный Telegram текущей сессии; вне запроса или без сессии — null. */
export function getSessionTgId(): number | null {
  try {
    const tg = readSession()?.tgId ?? null;
    if (tg) return tg;
  } catch {
    return null;
  }
  // DEV-ONLY локальный превью: Telegram подставного кошелька (вырезается в проде).
  if (process.env.NODE_ENV !== "production" && process.env.DEV_IMPERSONATE_TG) {
    const n = Number(process.env.DEV_IMPERSONATE_TG);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  return null;
}

export function getCurrentWallet(): string | null {
  // Cookie подписана HMAC (sessionCookie.ts): значение без валидной подписи
  // игнорируем — иначе `Cookie: gd_wallet=victim.near` давал бы чужую сессию.
  const fromCookie = readSession()?.wallet ?? null;
  if (fromCookie) return fromCookie;
  // DEV-ONLY локальный authed-превью (memory: golden-drop-local-preview).
  // Жёстко закрыто в проде: NODE_ENV-гард → в prod-бандле ветка вырезается
  // dead-code-элиминацией, даже если env-переменная случайно выставлена.
  if (process.env.NODE_ENV !== "production" && process.env.DEV_IMPERSONATE_WALLET) {
    return process.env.DEV_IMPERSONATE_WALLET;
  }
  return null;
}

/** Сессия ставится только вместе с проверенным Telegram (см. readSession). */
export function setCurrentWallet(wallet: string, tgId: number) {
  if (!Number.isSafeInteger(tgId) || tgId <= 0) throw new Error("Вход только через Telegram");
  // httpOnly: клиентский код эту cookie не читает (проверено грепом по src/),
  // поэтому закрываем её от JS — украсть сессию через XSS больше нельзя.
  // secure: сайт только по https; в dev (http://localhost) не ставим, иначе
  // браузер отбросит cookie и локальный превью не залогинится.
  setCookie(COOKIE, signCookieValue(`${wallet}#${tgId}`), {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
  // Сессия сменилась — метку аккаунта сбрасываем, иначе новый вход донашивал
  // бы чужой аккаунт из прошлой сессии. Следующий currentAccount() поставит
  // правильный.
  setCookie(ACC_COOKIE, "", { path: "/", maxAge: 0 });
}

export function clearCurrentWallet() {
  setCookie(COOKIE, "", { path: "/", maxAge: 0 });
  setCookie(ACC_COOKIE, "", { path: "/", maxAge: 0 });
}

// ─── Сессия по аккаунту ───
//
// Игрок — это аккаунт (ПРАВИЛА.md, «Игрок = аккаунт»), поэтому сессия хранит
// его id. Кошелёк в cookie остаётся: он всё ещё нужен там, где речь о самом
// блокчейне — подпись, ввод и вывод. Но «кто это играет» отвечает аккаунт, и
// у игрока, зашедшего через Telegram, кошелька может не быть вовсе.

// Метка аккаунта привязана к сессии: в ней `acc|wallet#tgId`, и она годится
// только при той же сессии (18.10.2026). Иначе сохранённая метка чужого аккаунта
// (снятая, пока вход был без Telegram) работала бы рядом с любой новой сессией.
export function getCurrentAccountId(): string | null {
  const s = readSession();
  if (!s) return null;
  const v = readSignedCookieValue(getCookie(ACC_COOKIE) ?? null);
  if (!v) return null;
  const at = v.lastIndexOf("|");
  if (at <= 0 || v.slice(at + 1) !== `${s.wallet}#${s.tgId}`) return null;
  return v.slice(0, at);
}

export function setCurrentAccountId(accountId: string) {
  const s = readSession();
  if (!s) return;
  setCookie(ACC_COOKIE, signCookieValue(`${accountId}|${s.wallet}#${s.tgId}`), {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/**
 * Аккаунт текущей сессии. Если в cookie его ещё нет (сессия открыта до
 * перехода на аккаунты), достаём по адресу и запоминаем — второй раз в базу
 * не ходим.
 */
export async function currentAccount(): Promise<string | null> {
  const fromCookie = getCurrentAccountId();
  if (fromCookie) return fromCookie;
  const wallet = getCurrentWallet();
  if (!wallet) return null;
  const { accountOf } = await import("./api/user-shared");
  const acc = await accountOf(wallet).catch(() => null);
  if (acc) setCurrentAccountId(acc);
  return acc;
}

/** Тот же аккаунт, но «не вошёл» — это ошибка, а не пустое значение. */
export async function requireAccount(): Promise<string> {
  const acc = await currentAccount();
  if (!acc) throw new Error("Нужно войти в игру");
  return acc;
}

const ADMIN_ALLOWLIST = (process.env.ADMIN_WALLETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Админка по Telegram (владелец, 18.10.2026: «админка на любой кошелёк Ярослава,
// пока он привязан к его аккаунту»). Любой кошелёк, на котором сидит сессия этого
// Telegram, — админский. Сессия садится только на кошелёк, привязанный к тому же
// Telegram (вход, переключение, добавление с подписью), а getSession сбрасывает
// сессию, если кошелёк от Telegram отвязали. Выплаты — по своему списку, не здесь.
const ADMIN_TG_ALLOWLIST = (process.env.ADMIN_TG_ACCOUNTS ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isSafeInteger(n) && n > 0);

export function isAdminWallet(wallet: string | null): boolean {
  if (!wallet) return false;
  if (ADMIN_ALLOWLIST.includes(wallet)) return true;
  if (ADMIN_TG_ALLOWLIST.length === 0) return false;
  let s: Session | null = null;
  try {
    s = readSession();
  } catch {
    return false; // вне запроса cookie нет — только явный список
  }
  return !!s && s.wallet === wallet && ADMIN_TG_ALLOWLIST.includes(s.tgId);
}

/**
 * Админ ли кошелёк ВНЕ запроса (обходы, кроны): по списку или по привязке к
 * Telegram админа (не отключён). В запросе — isAdminWallet по сессии.
 */
export async function isAdminWalletLinked(wallet: string | null): Promise<boolean> {
  if (!wallet) return false;
  if (ADMIN_ALLOWLIST.includes(wallet)) return true;
  if (ADMIN_TG_ALLOWLIST.length === 0) return false;
  const u = await pg.users.findOne({ wallet }).catch(() => null);
  return !!u && !u.disconnected && ADMIN_TG_ALLOWLIST.includes(Number(u.telegram_id));
}

export function requireAdmin() {
  const wallet = getCurrentWallet();
  if (!isAdminWallet(wallet)) {
    throw new Error("Доступ запрещён: требуется admin-кошелёк");
  }
  return wallet as string;
}

/** Любой ПОДКЛЮЧЁННЫЙ кошелёк (без admin-проверки) — для игровых фич, открытых
 *  всем игрокам (напр. рейды). Кидает, если кошелёк не подключён. */
export function requireWallet() {
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Кошелёк не подключён");
  return wallet as string;
}

// Вторая ступень доступа: раздел «Выплаты» (раздача DARAI, выплаты NFT, починка
// оплат) — деньги, поэтому только для владельца: кошельки из PAYOUTS_ADMIN_WALLETS.
const PAYOUTS_ALLOWLIST = (process.env.PAYOUTS_ADMIN_WALLETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isPayoutsAdminWallet(wallet: string | null): boolean {
  if (!wallet) return false;
  // Список пуст — выплаты закрыты всем (18.10): раньше откатывались на всех
  // админов, а админы теперь и по Telegram — выплаты только у владельца.
  return PAYOUTS_ALLOWLIST.includes(wallet);
}

export function requirePayoutsAdmin() {
  const wallet = getCurrentWallet();
  if (!isPayoutsAdminWallet(wallet)) {
    throw new Error("Доступ запрещён: раздел «Выплаты» — только для владельца");
  }
  return wallet as string;
}

/**
 * Казначейство: смотреть, сколько игроки залутали, и менять USDT на DARAI в
 * пул карты. Это НЕ раздача дохода — рассылка реальных долей остаётся у
 * владельца (requirePayoutsAdmin).
 *
 * Отдельная ступень нужна, потому что пул карты наполняет коллекция DARAI, и
 * заводить обмен ради каждой заливки через владельца — лишнее звено. Список
 * задаётся TREASURY_WALLETS; пуст — доступ у обычных админов (владелец и
 * кошелёк коллекции), как и просили.
 */
const TREASURY_ALLOWLIST = (process.env.TREASURY_WALLETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isTreasuryWallet(wallet: string | null): boolean {
  if (!wallet) return false;
  if (isPayoutsAdminWallet(wallet)) return true;
  if (TREASURY_ALLOWLIST.length === 0) return isAdminWallet(wallet);
  return TREASURY_ALLOWLIST.includes(wallet);
}

/**
 * Внутрянка замка: отдельный простой редактор для оформления интерьера.
 * Полные права у админа; также разрешён дизайнер интерьера — @designer_example
 * (правила проекта: доступ по вайтлисту, без ролей в БД).
 *
 * Проверка по ДВУМ признакам: wallet и Telegram username. Изначально сунул
 * "designer.example.tg" в список wallet'ов — но её кошелёк называется иначе, и
 * блок ей просто не показывался. Реально её опознаёт TG-юзернейм.
 */
const CASTLE_EDITOR_WALLETS: string[] = [];
const CASTLE_EDITOR_TG_USERNAMES: string[] = ["player62"];

function eqCi(a: string | null | undefined, b: string): boolean {
  return typeof a === "string" && a.toLowerCase() === b.toLowerCase();
}

export function isCastleEditor(wallet: string | null, tgUsername: string | null): boolean {
  if (isAdminWallet(wallet)) return true;
  if (wallet && CASTLE_EDITOR_WALLETS.some((w) => eqCi(wallet, w))) return true;
  if (tgUsername && CASTLE_EDITOR_TG_USERNAMES.some((u) => eqCi(tgUsername, u))) {
    return true;
  }
  return false;
}

/** Обратная совместимость: старая точка, где TG ещё не поднят. Только wallet. */
export function isCastleEditorWallet(wallet: string | null): boolean {
  return isCastleEditor(wallet, null);
}

export async function requireCastleEditor(): Promise<string> {
  const wallet = getCurrentWallet();
  // TG username подтягиваем из users для честной проверки на дизайнера.
  let tgUsername: string | null = null;
  if (wallet) {
    try {
      const u = await pg.users.findOne({ wallet });
      tgUsername = u?.telegram_username ?? null;
    } catch {
      /* игнорируем — проверка по wallet ниже всё равно случится */
    }
  }
  if (!isCastleEditor(wallet, tgUsername)) {
    throw new Error("Доступ запрещён: редактор внутрянки замка");
  }
  return wallet ?? "";
}

export function requireTreasury() {
  const wallet = getCurrentWallet();
  if (!isTreasuryWallet(wallet)) {
    throw new Error("Доступ запрещён: казначейство — для владельца и коллекции");
  }
  return wallet as string;
}

// Test/preview-кошельки, которым НЕ нужна привязка Telegram. Полезно для
// тестирования клеймов с side-аккаунта без создания TG-привязки.
const TG_BYPASS = (process.env.TG_BYPASS_WALLETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isTgBypassWallet(wallet: string | null): boolean {
  if (!wallet) return false;
  return TG_BYPASS.includes(wallet);
}

// Роль «Тестировщик» — может видеть экспериментальные фичи (ландшафтная карта,
// новые механики) раньше обычных пользователей. Управляется через админку.
// Проверка: static allowlist (TESTER_WALLETS env) + БД (users.role).
import { pg } from "./db/pg";

const TESTER_ALLOWLIST = (process.env.TESTER_WALLETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function isTesterWalletSync(wallet: string | null): boolean {
  if (!wallet) return false;
  if (isAdminWallet(wallet)) return true; // админ = всегда тестировщик
  return TESTER_ALLOWLIST.includes(wallet);
}

/** Проверка роли из БД (async). Возвращает true если role = 'tester' или 'admin'. */
export async function isTesterWallet(wallet: string | null): Promise<boolean> {
  if (!wallet) return false;
  if (isAdminWallet(wallet)) return true;
  if (TESTER_ALLOWLIST.includes(wallet)) return true;
  try {
    const { data } = await pg.users.raw().select("role").eq("near_account_id", wallet).limit(1);
    const role = (data as Array<{ role?: string }> | null)?.[0]?.role;
    return role === "tester" || role === "admin";
  } catch {
    return false;
  }
}

export function requireTester() {
  const wallet = getCurrentWallet();
  if (!isTesterWalletSync(wallet)) {
    throw new Error("Доступ запрещён: требуется роль тестировщика");
  }
  return wallet as string;
}
