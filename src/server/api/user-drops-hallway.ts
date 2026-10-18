import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pg } from "../db/pg";
import { setCurrentWallet } from "../auth";

// Вход новичка по Telegram initData (startHallwaySession) и его помощники —
// ОДНА копия на проект (13.10.2026: было три одинаковых — здесь, в
// user-drops.ts и в старом user-tg-link.ts). Помощники берут отсюда же
// user-telegram.ts (вход TG) и user-auth.ts (сессия).

/** Восстанавливает ПОСЛЕДНИЙ выбранный юзером кош (accounts.active_wallet), если
 *  он всё ещё в списке кошельков аккаунта; иначе fallback (самый ранний/недавний).
 *  Так выбор коша «липнет» между входами, а не сбрасывается на канонический. */
export async function preferredActiveWallet(
  telegramId: number,
  walletList: string[],
  fallback: string,
): Promise<string> {
  try {
    const acc = (await pg.accounts.findOne({ telegram_id: telegramId })) as {
      active_wallet?: string | null;
    } | null;
    const aw = acc?.active_wallet;
    if (aw && walletList.includes(aw)) return aw;
  } catch {
    /* ignore — вернём fallback */
  }
  return fallback;
}

export async function verifyTelegramInitData(initData: string): Promise<
  | {
      ok: true;
      telegramId: number;
      username: string | null;
      firstName: string | null;
      startParam: string | null;
    }
  | { ok: false; error: string }
> {
  const botToken = process.env.TELEGRAM_HALLWAY_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return { ok: false, error: "bot_not_configured" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "no_hash" };
  params.delete("hash");

  const pairs: string[] = [];
  params.forEach((v, k) => pairs.push(`${k}=${v}`));
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const { createHmac } = await import("node:crypto");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (expected !== hash) return { ok: false, error: "bad_signature" };

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Math.floor(Date.now() / 1000) - authDate > 86400) {
    return { ok: false, error: "stale" };
  }

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false, error: "no_user" };
  let user: { id?: number; username?: string; first_name?: string } = {};
  try {
    user = JSON.parse(userRaw);
  } catch {
    return { ok: false, error: "user_parse" };
  }
  if (typeof user.id !== "number") return { ok: false, error: "no_user_id" };

  return {
    ok: true,
    telegramId: user.id,
    username: user.username ?? null,
    firstName: user.first_name ?? null,
    startParam: params.get("start_param"),
  };
}

/**
 * Вход в мини-апку «Прихожая» (онбординг новичков). В отличие от
 * loginViaTelegramInitData, НЕ требует уже привязанного кошелька:
 *   • если реальный кош к этому TG уже привязан — садимся на него;
 *   • иначе новичок получает лёгкую identity `tg<telegram_id>` (без коша).
 *     Кош здесь — не вход, а одно из заданий прихожей: получить и привязать.
 *     Прогресс (Юпик, EXP, осознанность) копится на этой identity; при
 *     привязке реального коша данные переносятся (отдельным шагом).
 *
 * `newbie=true` означает, что кош ещё не подключён — фронт показывает
 * онбординг, а не основной сервис.
 */
export const startHallwaySession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ initData: z.string().min(20), ref: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const v = await verifyTelegramInitData(data.initData);
    if (!v.ok) return { ok: false as const, error: v.error };
    const tgId = v.telegramId;

    // 1) Уже есть РЕАЛЬНЫЙ (не tg<id>) кош у этого TG — заходим на него.
    const linked = await pg.users.findMany(
      { telegram_id: tgId },
      { orderBy: { column: "created_at", ascending: true } },
    );
    const realWallets = linked
      .filter((u) => !/^tg\d+$/i.test(u.wallet) && !u.disconnected)
      .map((u) => u.wallet);
    if (realWallets.length > 0) {
      const chosen = await preferredActiveWallet(tgId, realWallets, realWallets[0]);
      setCurrentWallet(chosen, tgId);
      return { ok: true as const, wallet: chosen, newbie: false, tgId };
    }

    // 2) Новичок без коша — синтетическая identity tg<id>.
    const synthetic = `tg${tgId}`;
    let u = await pg.users.findOne({ wallet: synthetic });
    if (!u) {
      // Реф: из переданного ref или start_param мини-апки. Кто именно пригласил
      // и считается ли он — решает общий модуль (только новый Telegram).
      const ref = (data.ref || v.startParam || "").trim();
      await pg.users.insert({
        wallet: synthetic,
        telegram_id: tgId,
        telegram_username: v.username,
        telegram_linked_at: new Date().toISOString(),
        referred_by: null,
        hallway_onboarding: true,
      });
      const { attachReferral } = await import("./../referralAttach");
      await attachReferral({ friendWallet: synthetic, friendTgId: tgId, ref });
      // Прихожую новичок пропускает — сразу в игру со стартовым набором.
      const { skipHallwayForNewPlayer } = await import("./hallway-skip");
      await skipHallwayForNewPlayer(synthetic, tgId);
      u = await pg.users.findOne({ wallet: synthetic });
    }
    setCurrentWallet(synthetic, tgId);
    return { ok: true as const, wallet: synthetic, newbie: true, tgId };
  });
