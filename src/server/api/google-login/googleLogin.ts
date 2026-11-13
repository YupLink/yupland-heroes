// Вход через Google (владелец, 29.10.2026 — база; 06.11.2026 — «откроем для новых
// игроков — попадут сразу на остров новичков»). Открыт всем, когда settings
// google_login = 'on' (выключатель в /admin/google); иначе — только сессия админа.
// Новичок дальше идёт как новый Telegram-игрок: /chips → выбор расы → остров.
//
// Google-игрок — «как все»: свой id ≥ 2^52 вместо Telegram (lib/auth/googleTg.ts),
// сессия `tg<id>#<id>`. Награды и покупки в игре — как у всех, вывод закрыт
// (google.noWithdraw в ручках вывода и триггеры базы). Каждый вход пишет в журнал
// устройство, слепок браузера и адрес сети; одно устройство — один Google-аккаунт;
// совпадения — в админке (googleMulti.ts). Токен одноразовый (googleOnce.ts).
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { currentAccount, getCurrentWallet, isAdminWallet, setCurrentWallet } from "../../auth";
import { verifyGoogleIdToken } from "./verifyGoogleToken";
import { verifyGoogleAccessToken } from "./verifyGoogleAccess";
import {
  claimGoogleAccount,
  deviceTaken,
  ensureGoogleUser,
  googleAccountExists,
  logGoogleLogin,
  readGoogleSettings,
} from "./googleStore";
import { consumeGoogleToken } from "./googleOnce";
import { linkedSession } from "./googleLink";

/** Публично: есть ли Client ID и открыт ли вход всем. */
export const getGoogleLoginConfig = createServerFn({ method: "GET" }).handler(async () => {
  const s = await readGoogleSettings();
  return { clientId: s.clientId, open: s.open };
});

const header = (name: string): string | null => {
  try {
    return getRequestHeader(name) ?? null;
  } catch {
    return null; // вне запроса (тест, крон) заголовков нет
  }
};

/** Адрес сети: первый из x-forwarded-for, иначе x-real-ip. */
export function clientIp(xff: string | null, realIp: string | null): string | null {
  const first = (xff ?? "").split(",")[0]?.trim();
  const ip = first || (realIp ?? "").trim();
  return ip ? ip.slice(0, 64) : null;
}

const FP_RE = /^[0-9a-f]{64}$/;

export const loginWithGoogle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        /** ID-токен кнопки Google (админка /admin/google). */
        credential: z.string().min(20).max(8192).optional(),
        /** Токен доступа своей кнопки входа (экран гостя, verifyGoogleAccess.ts). */
        accessToken: z.string().min(20).max(4096).optional(),
        device: z.string().max(256).optional(),
        fp: z.string().max(128).optional(),
        /** Реф-ссылка сайта (?ref=tg<id>): новый Google-игрок — другом пригласившего. */
        ref: z.string().max(120).optional(),
      })
      .refine((x) => !!x.credential !== !!x.accessToken, "google.badToken")
      .parse(d),
  )
  .handler(async ({ data }) => {
    const cfg = await readGoogleSettings();
    if (!cfg.clientId) throw new Error("google.noClientId");
    // Гейт до проверки токена: закрытый вход не ходит за ключами Google ради чужих.
    const adminWallet = getCurrentWallet();
    const admin = isAdminWallet(adminWallet);
    if (!cfg.open && !admin) throw new Error("google.closed");
    const createdBy = cfg.open ? null : ((await currentAccount()) ?? adminWallet);

    const token = data.credential ?? data.accessToken ?? "";
    const who = data.credential
      ? await verifyGoogleIdToken(data.credential, cfg.clientId)
      : await verifyGoogleAccessToken(token, cfg.clientId);
    // Повтор того же токена — отказ: перехваченный токен второй раз не впустит.
    if (!(await consumeGoogleToken(token, who.exp))) throw new Error("google.badToken");
    const device = (data.device ?? "").trim().slice(0, 64) || null;
    const fp = data.fp && FP_RE.test(data.fp) ? data.fp : null;
    const ip = clientIp(header("x-forwarded-for"), header("x-real-ip"));
    const ua = (header("user-agent") ?? "").slice(0, 200) || null;
    // Google, привязанный к аккаунту Telegram или кошелька (§8.127): вход в тот аккаунт,
    // без Google-ограничений; новых аккаунтов и правил устройства тут нет.
    const linked = await linkedSession(who.sub);
    if (linked) {
      await logGoogleLogin({ sub: who.sub, tgId: linked.tg, device, fp, ip, ua, created: false });
      setCurrentWallet(linked.wallet, linked.tg, { proven: true });
      return { ok: true as const, created: false, wallet: linked.wallet };
    }
    // Одно устройство — один Google-аккаунт (владелец, 29.10): новый не заводим,
    // если с этого устройства уже входили другим. Вход в уже заведённый — с любого.
    // Новый аккаунт без метки устройства и слепка не заводим: иначе проверку выше
    // обходит любой вызов без них (ревью 06.11.2026).
    if (cfg.deviceLimit && !(await googleAccountExists(who.sub))) {
      if (!device || !fp) throw new Error("google.noDevice");
      if (await deviceTaken(who.sub, { device, fp, ip })) throw new Error("google.deviceTaken");
    }

    const acc = await claimGoogleAccount(who.sub, who.email, createdBy);
    const created = await ensureGoogleUser(acc.tgId);
    await logGoogleLogin({
      sub: who.sub,
      tgId: acc.tgId,
      device,
      fp,
      ip,
      ua,
      created,
    });

    const wallet = `tg${acc.tgId}`;
    // Друг по ссылке не из Телеграма (владелец, 09.11.2026: «варианты, если это будет
    // не ТГ») — только новый аккаунт: вход старого по чужой ссылке связи не даёт.
    if (created && data.ref) {
      const { attachReferral } = await import("../../referralAttach");
      await attachReferral({ friendWallet: wallet, friendTgId: acc.tgId, ref: data.ref });
    }
    setCurrentWallet(wallet, acc.tgId);
    return { ok: true as const, created, wallet };
  });
