import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { z } from "zod";
import { pg } from "../db/pg";
import { getCurrentWallet, setCurrentWallet } from "../auth";
import { preferredActiveWallet, verifyTelegramInitData } from "./user-drops-hallway";

export const createTgChallenge = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = getCurrentWallet();
  if (!wallet) throw new Error("Сначала подключи NEAR-кошелёк");

  const me = await pg.users.findOne({ wallet });
  if (me?.telegram_id) {
    throw new Error("К этому кошельку уже привязан Telegram");
  }

  // Стираем все предыдущие попытки этого кошелька, чтобы старая ошибка
  // не висела в getSession после новой попытки.
  await pg.tgChallenges.delete({ wallet });

  const nonce = nanoid(24);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await pg.tgChallenges.insert({
    nonce,
    wallet,
    expires_at: expiresAt,
    consumed: false,
  });

  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "yuplink_bot";
  const link = `https://t.me/${botUsername}?start=auth_${nonce}`;
  return { nonce, link };
});

export const linkTelegram = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        username: z.string().optional(),
        photo_url: z.string().optional(),
        auth_date: z.number().int().positive(),
        hash: z.string().min(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    if (!wallet) throw new Error("Сначала подключи NEAR-кошелёк");

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("Бот не сконфигурирован на сервере");

    // 1. Свежесть подписи: 24 часа
    if (Math.floor(Date.now() / 1000) - data.auth_date > 86400) {
      throw new Error("Подпись Telegram просрочена, попробуй ещё раз");
    }

    // 2. HMAC-SHA256 проверка по протоколу Telegram Login Widget
    const { hash, ...fields } = data;
    const dataCheckString = Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const { createHash, createHmac } = await import("node:crypto");
    const secret = createHash("sha256").update(botToken).digest();
    const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
    if (expected !== hash) {
      throw new Error("Подпись Telegram невалидна");
    }

    // 3. Привязка с UNIQUE-инвариантом «1 кошелёк = 1 TG навсегда»
    const me = await pg.users.findOne({ wallet });

    if (me?.telegram_id && me.telegram_id !== data.id) {
      throw new Error("К этому кошельку уже привязан другой Telegram. Привязка постоянная.");
    }

    if (!me?.telegram_id) {
      // Проверим, не занят ли этот TG другим кошельком
      const occupied = await pg.users.findFirst({ telegram_id: data.id });
      if (occupied && occupied.wallet !== wallet) {
        const masked = occupied.wallet.replace(/^(.{4}).+(.{4})$/, "$1…$2");
        throw new Error(`Этот Telegram уже привязан к кошельку ${masked}. Один TG — один кошелёк.`);
      }
    }

    try {
      await pg.users.update(
        { wallet },
        {
          telegram_id: data.id,
          telegram_username: data.username ?? null,
          telegram_linked_at: new Date().toISOString(),
        },
      );
    } catch {
      throw new Error("Не удалось привязать: вероятно, этот Telegram уже занят другим кошельком.");
    }

    return { ok: true, username: data.username ?? null };
  });

/** Отказ входа по Telegram — в журнал одной строкой (без initData): иначе сбой входа
 *  не отличить от того, что запроса не было вовсе (17.10). */
const tgFail = (error: string) => (console.warn(`[tg-login] отказ: ${error}`), { ok: false as const, error });

/**
 * Авто-логин в Telegram Mini App: берём initData (raw URL-encoded строку
 * от Telegram.WebApp.initData), верифицируем по протоколу Mini Apps
 * (HMAC-SHA256 с ключом "WebAppData"), достаём telegram_id, ищем
 * user.wallet и проставляем cookie сессии.
 *
 * Зачем: cookie между TG-Mini App и in-app браузером/Safari не шерится.
 * Если юзер подключил кошелёк где-то ещё и привязал TG, то при заходе в
 * Mini App мы узнаём его по initData и сразу подцепляем сессию без
 * повторного коннекта.
 */
export const loginViaTelegramInitData = createServerFn({ method: "POST" })
  // ref — из адреса мини-аппа (?ref=tg<id>): бот открывает приложение именно
  // такой ссылкой, а start_param в ней не приезжает. Без этого поля вход через
  // Telegram терял реферала — приглашённый не засчитывался никому.
  .inputValidator((d: unknown) =>
    z.object({ initData: z.string().min(20), ref: z.string().max(120).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    // Подпись проверяет общий помощник: годится любой наш бот (кошелёк
    // @yuplink_bot, игра @yupland_heroes_bot, прихожая), и он же говорит, какой
    // именно открыл мини-апку — кошельковый ведёт только в кошелёк.
    const v = await verifyTelegramInitData(data.initData);
    if (!v.ok) return tgFail(v.error);
    const { telegramId, bot } = v;
    const user = { username: v.username ?? undefined };

    // Ищем привязанные wallet'ы этого TG. Если несколько — берём
    // наиболее свежий по telegram_linked_at (или alphabetically).
    const rows = await pg.users.findMany({ telegram_id: telegramId });
    if (rows.length === 0) {
      // Новый ТГ — естественно заводим лёгкую identity tg<id> (без коша),
      // hallway_onboarding=true → игрок попадает в ПРИХОЖУЮ. Так каждый ТГ =
      // свой аккаунт, хоть миллион на одном устройстве. Кош — задание внутри
      // прихожей, а не вход. (Тот же механизм, что и startHallwaySession.)
      const synthetic = `tg${telegramId}`;
      // Реф берём из адреса мини-аппа, а если его нет — из start_param.
      const refRaw = (data.ref || v.startParam || "").trim();
      let created = false;
      try {
        await pg.users.insert({
          wallet: synthetic,
          telegram_id: telegramId,
          telegram_username: user.username ?? null,
          telegram_linked_at: new Date().toISOString(),
          referred_by: null,
          hallway_onboarding: true,
        });
        created = true;
      } catch {
        // Гонка: параллельный запрос уже создал tg<id> — игнор, садимся ниже.
      }
      if (created) {
        const { attachReferral } = await import("../referralAttach");
        await attachReferral({
          friendWallet: synthetic,
          friendTgId: telegramId,
          ref: refRaw,
        });
        // Прихожую новичок пропускает: сразу в игру, со стартовым набором.
        const { skipHallwayForNewPlayer } = await import("./hallway-skip");
        await skipHallwayForNewPlayer(synthetic, telegramId);
      }
      setCurrentWallet(synthetic, telegramId, { proven: true });
      return { ok: true as const, wallet: synthetic, bot };
    }
    // Один аккаунт на Telegram (владелец, 06.11.2026): второй — в архив по правилу базы.
    await import("../accountArchive")
      .then((m) => m.oneAccountPerTg(telegramId, "tg-login"))
      .catch((e) => console.warn("[one-per-tg]", e instanceof Error ? e.message : e));
    rows.sort((a, b) => {
      const ax = a.telegram_linked_at ?? "";
      const bx = b.telegram_linked_at ?? "";
      return bx.localeCompare(ax);
    });
    // Отключённые коши не могут быть активными (скрыты у юзера).
    const active = rows.filter((r) => !r.disconnected);
    const pool = active.length > 0 ? active : rows;
    const wallet = await preferredActiveWallet(
      telegramId,
      pool.map((r) => r.wallet),
      pool[0].wallet,
    );
    setCurrentWallet(wallet, telegramId, { proven: true });
    return { ok: true as const, wallet, bot };
  });

/**
 * ПРЯМОЙ вход из БРАУЗЕРА (вне Telegram) через Telegram Login Widget.
 *
 * Виджет отдаёт подписанные ботом поля {id, first_name, username, auth_date, hash}.
 * Подпись — HMAC-SHA256 на секрете sha256(bot_token) (протокол Login Widget, как
 * linkTelegram — НЕ "WebAppData"-вариант мини-апки). Проверяем подпись и сажаем
 * сессию по telegram_id — так же, как loginViaTelegramInitData, но для веба. Кош не
 * нужен: Telegram — сама личность (identity-курс). `ref` — наш реф-параметр, в
 * data_check_string Telegram НЕ входит.
 */
export const loginViaTelegramWidget = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        username: z.string().optional(),
        photo_url: z.string().optional(),
        auth_date: z.number().int().positive(),
        hash: z.string().min(10),
        ref: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return { ok: false as const, error: "bot_not_configured" };
    if (Math.floor(Date.now() / 1000) - data.auth_date > 86400) {
      return { ok: false as const, error: "stale" };
    }

    // data_check_string — только ТГ-поля (ref/hash исключаем), sort по ключу, \n.
    const { ref, hash, ...tg } = data;
    const dataCheckString = Object.entries(tg)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const { createHash, createHmac } = await import("node:crypto");
    const secret = createHash("sha256").update(botToken).digest();
    const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
    if (expected !== hash) return { ok: false as const, error: "bad_signature" };

    // Сажаем сессию по telegram_id (зеркалит loginViaTelegramInitData).
    const telegramId = data.id;
    const rows = await pg.users.findMany({ telegram_id: telegramId });
    if (rows.length === 0) {
      const synthetic = `tg${telegramId}`;
      let created = false;
      try {
        await pg.users.insert({
          wallet: synthetic,
          telegram_id: telegramId,
          telegram_username: data.username ?? null,
          telegram_linked_at: new Date().toISOString(),
          referred_by: null,
          hallway_onboarding: true,
        });
        created = true;
      } catch {
        /* гонка: параллельный запрос уже создал tg<id> — садимся ниже */
      }
      if (created) {
        const { attachReferral } = await import("../referralAttach");
        await attachReferral({
          friendWallet: synthetic,
          friendTgId: telegramId,
          ref: (ref || "").trim(),
        });
        const { skipHallwayForNewPlayer } = await import("./hallway-skip");
        await skipHallwayForNewPlayer(synthetic, telegramId);
      }
      setCurrentWallet(synthetic, telegramId, { proven: true });
      return { ok: true as const, wallet: synthetic, newbie: true };
    }
    // Один аккаунт на Telegram (владелец, 06.11.2026): второй — в архив по правилу базы.
    await import("../accountArchive")
      .then((m) => m.oneAccountPerTg(telegramId, "tg-login"))
      .catch((e) => console.warn("[one-per-tg]", e instanceof Error ? e.message : e));
    rows.sort((a, b) => {
      const ax = a.telegram_linked_at ?? "";
      const bx = b.telegram_linked_at ?? "";
      return bx.localeCompare(ax);
    });
    const active = rows.filter((r) => !r.disconnected);
    const pool = active.length > 0 ? active : rows;
    const wallet = await preferredActiveWallet(
      telegramId,
      pool.map((r) => r.wallet),
      pool[0].wallet,
    );
    setCurrentWallet(wallet, telegramId, { proven: true });
    return { ok: true as const, wallet, newbie: false };
  });
