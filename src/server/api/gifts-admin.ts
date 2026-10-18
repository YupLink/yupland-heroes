// Админская раздача подарков.
//
// Раздаём НЕ всем подряд и НЕ по кошелькам: только аккаунтам с привязанным
// Telegram, которые подавали признаки жизни за последние 48 часов. Раздача «на
// каждый адрес» кормила бы тех, кто завёл больше кошельков, а рассылка «всем
// когда-либо зашедшим» — мёртвые души.
//
// Подарок кладём строкой в player_gift (ключ повтора — source_ref), добро
// выдаётся только когда игрок нажмёт «Забрать». Следом — письмо в бот: без
// него игрок не узнает, что его ждут.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";
import { requireAdmin, getCurrentWallet } from "../auth";
import { activeAccounts } from "./gifts-active";

/** Окно активности. 48 часов — по просьбе владельца. */
const ACTIVE_HOURS = 48;

/**
 * Письма шлём порциями: по одному с паузой 50 мс триста игроков заняли бы
 * пятнадцать секунд, и запрос админа успел бы отвалиться по таймауту. Порция
 * в 25 писем держится в пределах лимитов Bot API (~30 сообщений в секунду).
 */
const SEND_CHUNK = 25;

/** Сколько строк подарков пишем одним INSERT. */
const WRITE_CHUNK = 100;
const CHUNK_GAP_MS = 250;

export const adminGiftEnergyToActive = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        amount: z.number().int().positive().max(100_000),
        /** Своя подпись к подарку — необязательна. */
        note: z.string().max(200).optional(),
        hours: z.number().int().positive().max(720).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const by = getCurrentWallet() ?? "admin";
    const hours = data.hours ?? ACTIVE_HOURS;
    const players = await activeAccounts(hours);
    if (players.length === 0) return { ok: true as const, accounts: 0, notified: 0, hours };

    // Ключ раздачи стабилен внутри ПЯТИМИНУТНОГО окна: слепой повтор моста и
    // второе нажатие «а вдруг не прошло» попадают в тот же ключ и не раздают
    // энергию второй раз. Осознанная повторная раздача через пять минут —
    // новый ключ, это уже решение админа.
    const window5 = Math.floor(Date.now() / 300_000);
    const batch = `gift-energy:${window5}:${data.amount}`;
    const note = (data.note ?? "").trim();

    // Пишем пачками по сотне: одним запросом на триста игроков строка SQL
    // разрастается до десятков килобайт, а мост такие ответы уже подрезал.
    // Заголовок подарка не пишем: карточка сама покажет локализованное
    // «Энергия» (gifts.kind.energy) — русская строка в базе прилетела бы
    // английскому игроку как есть.
    const { createGifts } = await import("./gifts-create");
    const gotIt = new Set<string>();
    for (let i = 0; i < players.length; i += WRITE_CHUNK) {
      const done = await createGifts(
        players.slice(i, i + WRITE_CHUNK).map((p) => ({
          accountId: p.accountId,
          kind: "energy" as const,
          amount: data.amount,
          note: note || null,
          sourceRef: `${batch}:${p.accountId}`,
          createdBy: by,
        })),
        // Письма шлём ниже сами: там же считаем доставку и метим notified_at.
        { notify: false },
      );
      for (const acc of done) gotIt.add(acc);
    }
    const recipients = players.filter((p) => gotIt.has(p.accountId) && p.telegramId);

    // Письма шлём после записи: молчаливый подарок игрок просто не заметит.
    const { tgSendIfEnabled } = await import("../tg");
    const { getUserLang } = await import("../userLang");
    const { tFor } = await import("@/lib/i18n");
    const writeTo = async (p: (typeof recipients)[number]): Promise<boolean> => {
      const lang = await getUserLang(p.telegramId).catch(() => "ru" as const);
      // Тот же короткий зов, что и у одиночного подарка: сколько энергии
      // дали, игрок увидит в окне.
      const text = [
        `<b>${tFor(lang, "bot.gift_title")}</b>`,
        "",
        tFor(lang, "bot.gift_footer"),
      ].join("\n");
      return tgSendIfEnabled(p.telegramId as number, text).catch(() => false);
    };

    let notified = 0;
    const delivered: string[] = [];
    for (let i = 0; i < recipients.length; i += SEND_CHUNK) {
      const chunk = recipients.slice(i, i + SEND_CHUNK);
      const done = await Promise.all(chunk.map(writeTo));
      done.forEach((ok, k) => {
        if (!ok) return;
        notified++;
        delivered.push(chunk[k].accountId);
      });
      if (i + SEND_CHUNK < recipients.length) {
        await new Promise((r) => setTimeout(r, CHUNK_GAP_MS));
      }
    }

    // Кому письмо дошло — помечаем: иначе повторную рассылку по этой раздаче
    // не сделать, а колонка notified_at стояла бы пустой всегда.
    if (delivered.length > 0) {
      await mcpExec(
        `UPDATE yuplink.player_gift SET notified_at = now()
          WHERE source_ref IN (${delivered.map((a) => sqlStr(`${batch}:${a}`)).join(",")});`,
      ).catch(() => undefined);
    }

    return { ok: true as const, accounts: gotIt.size, notified, hours };
  });

/** Сколько игроков попадёт под раздачу прямо сейчас — для подписи на кнопке. */
export const adminActivePlayersCount = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  const players = await activeAccounts(ACTIVE_HOURS);
  return { accounts: players.length, hours: ACTIVE_HOURS };
});
