// Привязка реферала: одно место на все входы.
//
// Раньше связь писалась по-разному: connectWallet заводил запись в referrals,
// а вход через Telegram ставил только users.referred_by — а вся статистика и
// тиры считают по referrals. Приглашённые через ТГ не засчитывались никому
// (за 27–31.08 — ноль привязок при полусотне новичков).
//
// Правило владельца: зачёт только за НОВОГО человека с Telegram. Второй
// кошелёк уже известного ТГ рефералом не считается — иначе один игрок
// приносил бы инвайтеру билет за каждый свой кош.
import { nanoid } from "nanoid";
import { pg } from "./db/pg";

/** Кошелёк инвайтера по строке реф-ссылки: «tg<id>» или прямой кошелёк. */
export async function resolveInviter(refRaw: string | null | undefined): Promise<string | null> {
  const ref = (refRaw ?? "").trim();
  if (!ref) return null;
  const m = /^tg(\d+)$/i.exec(ref);
  if (!m) return (await pg.users.findOne({ wallet: ref }))?.wallet ?? null;
  const tgId = Number(m[1]);
  if (!Number.isFinite(tgId) || tgId <= 0) return null;
  const sisters = await pg.users.findMany(
    { telegram_id: tgId },
    { orderBy: { column: "created_at", ascending: true } },
  );
  return sisters[0]?.wallet ?? null;
}

/** Это первый кошелёк этого Telegram? Второй и следующие — тот же человек. */
async function isNewTelegram(tgId: number, friendWallet: string): Promise<boolean> {
  const rows = await pg.users.findMany({ telegram_id: tgId });
  return rows.every((r) => r.wallet === friendWallet);
}

/** У этого Telegram уже есть реф-связь? Одна на человека, первая побеждает. */
async function alreadyReferred(tgId: number | null, friendWallet: string): Promise<boolean> {
  const wallets =
    tgId == null
      ? [friendWallet]
      : (await pg.users.findMany({ telegram_id: tgId })).map((u) => u.wallet);
  const { data } = await pg.referrals
    .raw()
    .select("id")
    .in("friend_wallet", Array.from(new Set([friendWallet, ...wallets])))
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * Записать реферала и доначислить инвайтеру тир-билеты.
 *
 * Возвращает кошелёк инвайтера, если связь записана. null — не записана:
 * ссылки не было, инвайтер не найден, Telegram не новый или связь уже есть.
 * Ошибки не пробрасываем: вход игрока важнее реф-учёта.
 */
export async function attachReferral(opts: {
  friendWallet: string;
  friendTgId: number | null;
  /** Строка из ссылки: «tg<id>» или кошелёк. */
  ref: string | null | undefined;
}): Promise<string | null> {
  try {
    const inviter = await resolveInviter(opts.ref);
    if (!inviter || inviter === opts.friendWallet) return null;

    // Свой же Telegram по ссылке самому себе — не реферал.
    if (opts.friendTgId != null) {
      const inv = await pg.users.findOne({ wallet: inviter });
      if (inv?.telegram_id != null && inv.telegram_id === opts.friendTgId) return null;
      if (!(await isNewTelegram(opts.friendTgId, opts.friendWallet))) return null;
    }
    if (await alreadyReferred(opts.friendTgId, opts.friendWallet)) return null;

    await pg.referrals.upsert(
      {
        id: nanoid(),
        inviter_wallet: inviter,
        friend_wallet: opts.friendWallet,
        joined_at: new Date().toISOString().slice(0, 10),
      },
      { onConflict: "friend_wallet" },
    );
    // users.referred_by держим синхронно: по нему видно происхождение игрока
    // даже там, где referrals почищены дедупом.
    await pg.users.update({ wallet: opts.friendWallet }, { referred_by: inviter });

    try {
      const { grantReferralTierTicketsIfDue } = await import("./referralTiers");
      await grantReferralTierTicketsIfDue(inviter);
    } catch (err) {
      console.warn("[referralAttach] тир не начислен:", err);
    }
    return inviter;
  } catch (err) {
    console.warn("[referralAttach] привязка не удалась:", err);
    return null;
  }
}
