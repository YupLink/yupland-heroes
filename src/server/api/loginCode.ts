// Код-вход (device-link): полная автономность учётки. В приложении (где ты уже
// авторизован — Telegram/кош) генеришь короткий код; в браузере/на другом
// устройстве вводишь его → входишь в ТУ ЖЕ учётку без кошелька. Активы на учётке
// (account_id), кош нужен только для on-chain.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { pg } from "../db/pg";
import { getCurrentWallet, getSessionTgId, setCurrentWallet } from "../auth";
import { mcpExec } from "../db/mcpClient";
import { isGoogleTg, isWalletTg } from "@/lib/auth/googleTg";

// Читаемый код без неоднозначных символов (0/O, 1/I/L), 8 знаков (~31^8 ≈ 8·10^11).
const genCode = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 8);
const TTL_MS = 5 * 60 * 1000;

// Перебор кодов: 10 попыток в минуту с одного адреса (guessGate) и общий
// бэкстоп. Раньше был только общий порог 40/мин — один перебирающий закрывал
// вход по коду всем (аудит 11.11.2026). 8-знач. код перебором не взять и так.
let redeemWindowStart = 0;
let redeemCount = 0;
const REDEEM_MAX_PER_MIN = 600;

/** Создать код для входа в браузере. Требует активной сессии (ты уже вошёл). */
export const createLoginCode = createServerFn({ method: "POST" }).handler(
  async () => {
    const wallet = getCurrentWallet();
    if (!wallet || !getSessionTgId()) throw new Error("Сначала войди в приложении через Telegram");
    (await import("../walletOnlySession")).assertNotWalletOnly();
    await assertGoogleOpen(getSessionTgId());
    const me = (await pg.users.findOne({ wallet })) as {
      account_id?: string | null;
    } | null;
    const code = genCode();
    const w = wallet.replace(/'/g, "''");
    const acc = me?.account_id ? `'${me.account_id.replace(/'/g, "''")}'` : "NULL";
    await mcpExec(
      `INSERT INTO yuplink.login_codes(code, account_id, wallet, expires_at)
       VALUES('${code}', ${acc}, '${w}', now() + interval '${TTL_MS} milliseconds');`
    );
    // Чистим старые (просроченные/использованные >1ч) — таблица не растёт.
    mcpExec(
      `DELETE FROM yuplink.login_codes WHERE expires_at < now() - interval '1 hour';`
    ).catch(() => {});
    return { code, expiresInSec: Math.floor(TTL_MS / 1000) };
  }
);

/** Погасить код в браузере → устанавливает сессию на ту же учётку. Авторизация
 *  НЕ требуется (это и есть вход). Код одноразовый, короткоживущий. */
export const redeemLoginCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().min(4).max(12) }).parse(d)
  )
  .handler(async ({ data }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip =
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ||
      getRequestHeader("x-real-ip") ||
      "-";
    const { guessGate } = await import("../rateGate");
    await guessGate("login_code", ip);
    // Общий бэкстоп от перебора с многих адресов.
    const now = Date.now();
    if (now - redeemWindowStart > 60_000) {
      redeemWindowStart = now;
      redeemCount = 0;
    }
    if (++redeemCount > REDEEM_MAX_PER_MIN) {
      throw new Error("Слишком много попыток — подожди минуту");
    }
    const code = data.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    // Атомарно: гасим только валидный (не просрочен, не использован) код.
    const rows = (await mcpExec(
      `UPDATE yuplink.login_codes SET consumed=true
        WHERE code='${code.replace(/'/g, "''")}' AND consumed=false AND expires_at > now()
        RETURNING wallet;`,
      { wrapJsonCte: true }
    )) as Array<{ wallet: string }>;
    if (!rows[0]) throw new Error("Код неверный или истёк");
    // Сессия — только с Telegram (18.10.2026): берём Telegram, к которому кошелёк
    // привязан сейчас. Отвязали за эти минуты — входа по коду нет.
    const owner = await pg.users.findOne({ wallet: rows[0].wallet });
    const tg = Number(owner?.telegram_id);
    if (!owner || !Number.isSafeInteger(tg) || tg <= 0) {
      throw new Error("Кошелёк не привязан к Telegram — войди через Telegram");
    }
    await assertGoogleOpen(tg);
    setCurrentWallet(rows[0].wallet, tg);
    return { ok: true as const, wallet: rows[0].wallet };
  });

/** Google-игрок, пока вход через Google закрыт (§8.91), по коду не входит — только из админки. */
async function assertGoogleOpen(tg: number | null): Promise<void> {
  // Вход по кошельку (06.11.2026) открыт — код на другое устройство можно.
  if (!isGoogleTg(tg) || isWalletTg(tg)) return;
  const { readGoogleSettings } = await import("./google-login/googleStore");
  if (!(await readGoogleSettings()).open) throw new Error("google.closed");
}
