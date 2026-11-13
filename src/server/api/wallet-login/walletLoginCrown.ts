// Новый аккаунт по NEAR-кошельку — только со ссылки «Короны гречневого королевства»
// (/crown). Владелец, 08.11.2026: «чтобы мы могли дать эту ссылку кому-то и этот
// кто-то мог играть, войдя кошельком; новые коши должны быть в базе — и потом можно
// войти в саму игру по кошу». Экран гостя игры новых по кошельку по-прежнему не
// заводит (06.11, перед Xsolla) — только эта ссылка.
//
// Как было до be38cd03 (06.11): адрес-ключ (implicit) — только живой на блокчейне,
// с одного устройства — один новый аккаунт (метка устройства обязательна, занимается
// атомарно — wallet_new_device). Мест (лимита) нет — владелец не назвал.
// Вывод: номер «не Telegram» закрывает вывод наружу (google-01); аккаунт со ссылки
// получает одну дверь — DARAI по правилу «введённое + 10 %» (buckwheat-04,
// darai_withdraw_own_only.bonus_pct = 10).
import { pg } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireFullAccessKey } from "../nep413-login";
import { claimWalletTg } from "./walletLoginStore";

/** «Введённое и максимум +10 %» (владелец, 08.11.2026). */
export const CROWN_WITHDRAW_BONUS_PCT = 10;
const NO_LIMIT = 2_000_000_000;

type Device = { device: string | null; fp: string | null; ip: string | null };

/**
 * С этого устройства уже заводили НОВЫЙ аккаунт другим кошельком: та же метка
 * браузера или тот же слепок с того же адреса. Иначе один скрипт с бесплатными
 * адресами завёл бы сотни аккаунтов (подарки новичка на острове).
 */
export async function newDeviceTaken(wallet: string, d: Device): Promise<boolean> {
  const by: string[] = [];
  if (d.device) by.push(`device = ${sqlStr(d.device)}`);
  if (d.fp && d.ip) by.push(`(fp = ${sqlStr(d.fp)} AND ip = ${sqlStr(d.ip)})`);
  if (by.length === 0) return false;
  const rows = (await mcpExec(
    `SELECT 1 AS x FROM yuplink.wallet_login_log
      WHERE kind = 'new' AND created AND wallet <> ${sqlStr(wallet)} AND (${by.join(" OR ")}) LIMIT 1`,
    { wrapJson: true },
  )) as unknown[];
  return rows.length > 0;
}

/**
 * Новый игрок по кошельку — как новый Telegram-игрок: строка users на сам кошелёк
 * (владение доказано подписью), стартовый набор — skipHallwayForNewPlayer.
 * true — строка создана сейчас.
 */
async function ensureWalletUser(wallet: string, tgId: number): Promise<boolean> {
  if (await pg.users.findOne({ wallet })) return false;
  const now = new Date().toISOString();
  const { deriveWalletKind } = await import("../wallet-link");
  const wk = deriveWalletKind(wallet);
  let created = false;
  try {
    await pg.users.insert({
      wallet,
      telegram_id: tgId,
      telegram_username: null,
      telegram_linked_at: now,
      referred_by: null,
      hallway_onboarding: true,
      wallet_kind: wk.kind,
      wallet_storage: wk.storage,
      ownership_verified: true,
      ownership_verified_at: now,
      ownership_method: "nep413",
    });
    created = true;
  } catch (e) {
    // Гонка: параллельный вход уже создал строку — садимся на неё.
    if (!(await pg.users.findOne({ wallet }))) throw e;
  }
  if (created) {
    const { skipHallwayForNewPlayer } = await import("../hallway-skip");
    await skipHallwayForNewPlayer(wallet, tgId);
  }
  return created;
}

/**
 * Правило вывода аккаунта со ссылки: DARAI — введённое и до +10 % (buckwheat-04).
 * Зовётся при заведении и на каждом входе такого кошелька: сорвалось при заведении —
 * дольётся при следующем входе. Только кошельку, заведённому как новый с 08.11
 * (account_wallet_login kind new) — старым аккаунтам вывод так не откроется.
 */
export async function openCrownWithdraw(wallet: string): Promise<void> {
  const { accAccountId } = await import("../currency/move");
  const account = await accAccountId(wallet);
  if (!account) throw new Error("walletLogin.failed");
  const a = sqlStr(account);
  const w = sqlStr(wallet);
  const why = sqlStr(
    `Кошелёк со ссылки «Короны» ${wallet}: введённое + 10 % (владелец, 08.11.2026)`,
  );
  await mcpExec(
    `INSERT INTO yuplink.darai_withdraw_own_only (account_id, since, reason, bonus_pct)
     SELECT ${a}, now(), ${why}, ${CROWN_WITHDRAW_BONUS_PCT}
      WHERE EXISTS (SELECT 1 FROM yuplink.account_wallet_login l
                     WHERE l.wallet = ${w} AND l.kind = 'new' AND l.created_at >= '2026-11-08'
                       AND coalesce(l.entry, 'crown') = 'crown')
        AND NOT EXISTS (SELECT 1 FROM yuplink.darai_withdraw_own_only o WHERE o.account_id = ${a})
     RETURNING account_id;`,
    { wrapJsonCte: true },
  );
}

/** Занять устройство под новый кошелёк: одно устройство — один (повтор тем же кошельком — да). */
async function claimDevice(wallet: string, device: string): Promise<boolean> {
  const rows = (await mcpExec(
    `INSERT INTO yuplink.wallet_new_device AS d (device, wallet) VALUES (${sqlStr(device)}, ${sqlStr(wallet)})
     ON CONFLICT (device) DO UPDATE SET device = d.device
     RETURNING d.wallet;`,
    { wrapJsonCte: true },
  )) as Array<{ wallet?: string }> | null;
  return rows?.[0]?.wallet === wallet;
}

/** Вход с near.service.yupland.io (§8.127): аккаунт без «Короны» — вывода нет. Повтор — без перемен. */
async function markNearEntry(wallet: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.account_wallet_login SET entry = 'near'
      WHERE wallet = ${sqlStr(wallet)} AND kind = 'new' AND entry IS NULL
        AND NOT EXISTS (SELECT 1 FROM yuplink.users u WHERE u.wallet = ${sqlStr(wallet)})
     RETURNING wallet;`,
    { wrapJsonCte: true },
  );
}

/**
 * Завести аккаунт новому кошельку со ссылки: «Корона» (по умолчанию) или страница
 * near.service.yupland.io. Повтор входа — тот же номер и аккаунт.
 */
export async function createCrownAccount(
  wallet: string,
  proof: { implicit: boolean; publicKey: string },
  dev: Device,
  entry: "crown" | "near" = "crown",
): Promise<{ tg: number; created: boolean }> {
  if (!dev.device) throw new Error("walletLogin.failed");
  if (proof.implicit) await requireFullAccessKey(wallet, proof.publicKey);
  if (await newDeviceTaken(wallet, dev)) throw new Error("walletLogin.deviceTaken");
  if (!(await claimDevice(wallet, dev.device))) throw new Error("walletLogin.deviceTaken");
  const tg = await claimWalletTg(wallet, "new", NO_LIMIT);
  if (tg == null) throw new Error("walletLogin.failed");
  // Метка до строки users: пока её нет, кошелёк ещё «новый» — чужой вход его не перехватит.
  if (entry === "near") await markNearEntry(wallet);
  const created = await ensureWalletUser(wallet, tg);
  if (entry === "crown") await openCrownWithdraw(wallet);
  return { tg, created };
}
