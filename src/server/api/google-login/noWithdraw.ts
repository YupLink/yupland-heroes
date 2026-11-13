// Google-игроку вывод наружу закрыт (владелец, 29.10.2026): «награда должна приходить
// и гугл-игроку — просто он не может её вывести, но может что-то купить в самой игре».
// Зовётся первым делом в каждой ручке вывода; второй рубеж — триггеры базы
// (migrations/google-01-login.sql, ошибка google_no_withdraw).
import { getCurrentWallet, getSessionTgId } from "../../auth";
import { isGoogleTg, isWalletTg } from "@/lib/auth/googleTg";
import { isWalletOnlySession } from "../../walletOnlySession";
import { assertWithdrawListed } from "../withdraw-list/withdrawList";

export function assertNotGoogleWithdraw(): void {
  const tg = getSessionTgId();
  // Вход по кошельку без Telegram (06.11.2026) — тот же запрет, своя причина.
  if (isWalletTg(tg) || isWalletOnlySession()) throw new Error("walletLogin.noWithdraw");
  if (isGoogleTg(tg)) throw new Error("google.noWithdraw");
}

/**
 * Вывод со счёта. Кошелёк, заведённый по ссылке «Короны гречневого королевства»
 * (08.11.2026), выводит DARAI по правилу «введённое + 10 %» — метка в базе
 * darai_withdraw_own_only.bonus_pct > 0 (buckwheat-04, тот же рубеж в триггерах).
 * Всё остальное — как assertNotGoogleWithdraw.
 */
export async function assertAccountWithdrawOpen(token: string): Promise<void> {
  const tg = getSessionTgId();
  const wallet = getCurrentWallet();
  if (token === "Darai" && wallet && isWalletTg(tg) && !isWalletOnlySession()) {
    const { accAccountId } = await import("../currency/move");
    const account = await accAccountId(wallet);
    if (account && (await crownWithdrawOpen(account))) return;
  }
  // Вход старым кошельком, привязанным без подписи (метка сессии), — а кошелёк с тех пор
  // подтверждён (подпись в «Мой кошелёк» или владельцем, 08.11): вывод как у всех.
  const verifiedOld =
    !!wallet && isWalletOnlySession() && !isGoogleTg(tg) && (await walletVerified(wallet));
  if (!verifiedOld) assertNotGoogleWithdraw();
  // Новым аккаунтам вывода нет — только списку (§8.127, 11.11.2026).
  await assertWithdrawListed(wallet);
}

async function walletVerified(wallet: string): Promise<boolean> {
  const { pg } = await import("../../db/pg");
  const u = (await pg.users.findOne({ wallet }).catch(() => null)) as {
    ownership_verified?: boolean | null;
    disconnected?: boolean | null;
  } | null;
  return u?.ownership_verified === true && !u.disconnected;
}

async function crownWithdrawOpen(account: string): Promise<boolean> {
  const { mcpExec } = await import("../../db/mcpClient");
  const { sqlStr } = await import("../raid-shared");
  const rows = (await mcpExec(
    `SELECT 1 AS x FROM yuplink.darai_withdraw_own_only
      WHERE account_id = ${sqlStr(account)} AND bonus_pct > 0`,
    { wrapJson: true },
  )) as unknown[];
  return (rows ?? []).length > 0;
}
