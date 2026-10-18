// Уведомление получателю: «тебе начислили артефакт/героя».
//
// Зачем отдельный модуль: выдача (items-grant-batch) не должна знать про
// Telegram, а tg.ts — про предметы. Здесь только «кому и что написать».
//
// Правила, ради которых это писалось:
//   - ОДНО сообщение на человека, а не на кошелёк. У аккаунта бывает несколько
//     кошельков-сестёр; выдача на два коша сразу — это всё равно один человек,
//     и счётчик у него в сообщении общий.
//   - Тумблер уведомлений уважаем (users.notifications_enabled), как это делает
//     tgSendIfEnabled: достаточно одного включённого коша у этого TG.
//   - Кошельки в текст не попадают — человеку они не нужны.
//   - Ничего не бросаем наружу: предметы уже выданы, телеграм — побочный эффект.

import { pg } from "./db/pg";
import { tgSendMessage } from "./tg";
import { getUserLang } from "./userLang";
import { tFor } from "@/lib/i18n";
import { metaLabel } from "@/components/heroMeta";

/** Что именно пришло — ровно то, что показываем в сообщении. */
export type GrantedItemInfo = {
  kind: string;
  name: string;
  /** Артефакт: common/rare/epic/legendary. */
  rarity: string | null;
  /** Герой: звёзды шаблона → редкость (5★ leg, 4★ epic, иначе rare). */
  level: number | null;
  specialization: string | null;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/** Редкость героя по ярусу шаблона — та же формула, что при пробуждении
 *  экземпляра (heroes-list-dormant), чтобы в сообщении и в игре совпадало. */
function heroRarityKey(level: number | null): string {
  const l = Number(level) || 0;
  if (l >= 5) return "legendary";
  if (l >= 4) return "epic";
  if (l >= 3) return "rare";
  return "common";
}

function titleKey(kind: string): string {
  if (kind === "hero") return "bot.grant_hero_title";
  if (kind === "artifact") return "bot.grant_artifact_title";
  return "bot.grant_item_title";
}

/** Текст сообщения на языке получателя. Имя предмета — как завёл админ
 *  (перевода названий нет), обёртка вокруг — локализована. */
export function buildGrantMessage(item: GrantedItemInfo, count: number, lang: "ru" | "en"): string {
  const details =
    item.kind === "hero"
      ? [metaLabel(heroRarityKey(item.level), lang), metaLabel(item.specialization, lang)]
      : [metaLabel(item.rarity, lang)];
  const sub = details.filter(Boolean).join(" · ");
  return [
    `<b>${tFor(lang, titleKey(item.kind))}</b>`,
    "",
    `${escapeHtml(item.name)} ×${count}`,
    ...(sub ? [sub] : []),
    "",
    tFor(lang, "bot.grant_footer"),
  ].join("\n");
}

/**
 * Кому и сколько — по списку выданных кошельков. Вынесено отдельно, потому что
 * вся тонкость уведомления живёт здесь: свести кошельки в людей и отсеять тех,
 * кто уведомления выключил.
 */
export async function resolveGrantRecipients(
  grants: Array<{ wallet: string; count: number }>,
): Promise<Array<{ telegramId: number; count: number }>> {
  if (grants.length === 0) return [];
  const wallets = Array.from(new Set(grants.map((g) => g.wallet)));
  const { data: rows } = await pg.users
    .raw()
    .select("wallet,telegram_id,notifications_enabled")
    .in("wallet", wallets);
  const users = (rows ?? []) as Array<{
    wallet: string;
    telegram_id: number | null;
    notifications_enabled: boolean;
  }>;

  // Кошелёк → TG. Один человек = один telegram_id, счётчик суммируем по его
  // кошелькам: две строки в раздаче для сестёр — одно сообщение с общим ×N.
  const tgByWallet = new Map<string, number>();
  const enabledByTg = new Map<number, boolean>();
  for (const u of users) {
    if (typeof u.telegram_id !== "number") continue;
    tgByWallet.set(u.wallet, u.telegram_id);
    // Достаточно одного включённого коша — как в tgSendIfEnabled.
    const was = enabledByTg.get(u.telegram_id) ?? false;
    enabledByTg.set(u.telegram_id, was || u.notifications_enabled);
  }

  const totalByTg = new Map<number, number>();
  for (const g of grants) {
    const tg = tgByWallet.get(g.wallet);
    if (tg === undefined) continue; // кош без привязанного телеграма — писать некуда
    if (!enabledByTg.get(tg)) continue; // уведомления выключены — не беспокоим
    totalByTg.set(tg, (totalByTg.get(tg) ?? 0) + g.count);
  }
  return Array.from(totalByTg, ([telegramId, count]) => ({ telegramId, count }));
}

/**
 * Разослать уведомления по успешно выданным кошелькам.
 * Возвращает число людей (не кошельков), которым сообщение реально ушло.
 */
export async function notifyItemGrant(
  grants: Array<{ wallet: string; count: number }>,
  item: GrantedItemInfo,
): Promise<number> {
  try {
    let sent = 0;
    for (const r of await resolveGrantRecipients(grants)) {
      const lang = await getUserLang(r.telegramId);
      const ok = await tgSendMessage(r.telegramId, buildGrantMessage(item, r.count, lang));
      if (ok) sent++;
      // Telegram даёт ~30 msg/sec — тот же интервал, что у остальных рассылок.
      await new Promise((r2) => setTimeout(r2, 50));
    }
    return sent;
  } catch (err) {
    console.warn("notifyItemGrant failed:", err);
    return 0;
  }
}
