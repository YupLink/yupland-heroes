// Кто позвал игрока (lib/referralShare.ts): по строке ссылки (tg<id>) — для бота и
// экрана входа в браузере, по аккаунту — для меню входа новичка. Только ник
// Telegram (публичный), без кошельков и id.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { cleanTgName, type InviteWho } from "@/lib/referralShare";

const NONE: InviteWho = { invited: false, name: null };

const nameOfTgSql = (col: string) =>
  `(SELECT u2.telegram_username FROM yuplink.users u2
     WHERE u2.telegram_id = ${col} AND u2.telegram_username IS NOT NULL
     ORDER BY u2.created_at LIMIT 1)`;

async function one(sql: string): Promise<InviteWho> {
  const rows = (await mcpExec(sql, { wrapJson: true }).catch(() => [])) as Array<{
    name: unknown;
  }> | null;
  const row = rows?.[0];
  return row ? { invited: true, name: cleanTgName(row.name) } : NONE;
}

/** По ссылке «tg<id>»: игрок с таким Telegram есть — приглашение, с ником если есть. */
export async function inviteOfRef(ref: string | null | undefined): Promise<InviteWho> {
  const m = /^tg(\d{1,15})$/i.exec((ref ?? "").trim());
  if (!m) return NONE;
  return one(
    `SELECT ${nameOfTgSql("u.telegram_id")} AS name FROM yuplink.users u
      WHERE u.telegram_id = ${m[1]} LIMIT 1;`,
  );
}

/** По аккаунту друга: реф-связь любого его кошелька (referrals) → ник пригласившего. */
export async function inviteOfAccount(account: string): Promise<InviteWho> {
  return one(
    `SELECT ${nameOfTgSql("iu.telegram_id")} AS name
       FROM yuplink.referrals r
       JOIN yuplink.users fu ON fu.wallet = r.friend_wallet
       LEFT JOIN yuplink.users iu ON iu.wallet = r.inviter_wallet
      WHERE fu.account_id = ${sqlStr(account)}
      LIMIT 1;`,
  );
}
