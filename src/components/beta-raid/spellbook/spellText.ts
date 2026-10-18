// Слова книги заклинаний: часы отката, расшифровка эффектов и причина отказа.
//
// Вынесено из плитки, потому что одни и те же строки нужны и плитке, и итогу
// каста, а считать «что даёт заклинание» двумя способами — верный путь к тому,
// что в списке обещано «+3 к интеллекту», а в тосте прилетает другое.
//
// Расшифровка эффектов НЕ своя: boostListText — общий помощник алтаря, товара
// из рюкзака и книги (lib/hero/boost.ts). Заклинание — тот же список
// BoostEffect, и переписывать его здесь значило бы завести третью правду.
import { boostListText } from "@/lib/hero/boost";
import type { SpellBookEntry } from "@/server/api/beta-raid/spell-book";

type T = (key: string, params?: Record<string, string | number>) => string;

/** Часы отката: «9с» показываем как 0:09, час и больше — с часами. */
export function cooldownClock(sec: number): string {
  const left = Math.max(0, Math.floor(sec));
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Что заклинание делает, человеческими словами.
 *
 * У технических заклинаний (корабль, перенос) прибавок может не быть вовсе —
 * тогда строка одна, про само действие. Если админ дал технике ещё и бусты,
 * покажем оба: игроку важно, что кроме переноса ему прилетит +2 к скорости.
 */
export function spellGiftLines(entry: SpellBookEntry, lang: "ru" | "en", t: T): string[] {
  const lines: string[] = [];
  if (entry.kind === "summon_ship") lines.push(t("braid.spell_gift_ship"));
  if (entry.kind === "teleport_town") lines.push(t("braid.spell_gift_teleport"));
  if (entry.kind === "create_ship") lines.push(t("braid.spell_gift_ship_create"));
  if (entry.kind === "repair_ship") lines.push(t("braid.spell_gift_ship_repair"));
  if (entry.effects.length > 0) lines.push(boostListText(entry.effects, lang));
  else if (lines.length === 0) lines.push(t("braid.spell_gift_none"));
  return lines;
}

/** Тон отказа: откат проходит сам, остальное игрок должен пойти и починить. */
export type SpellBlock = { text: string; waiting: boolean };

/**
 * Почему нажать нельзя — или null, если можно.
 *
 * Энергию проверяем ЗДЕСЬ, а не только на сервере: сервер шлёт книгу редко, а
 * баланс меняется каждым шагом по карте. Без клиентской проверки кнопка
 * выглядела бы живой, игрок жал бы её и получал отказ уже после запроса —
 * ровно то, чего просил не делать владелец («в минус не идём»).
 *
 * Порядок причин — от непроходимой к временной: выключенное заклинание, потом
 * интеллект, потом энергия, и только потом откат. Иначе выключенное показывало
 * бы бодрый таймер, будто оно вот-вот заработает.
 */
export function spellBlock(
  entry: SpellBookEntry,
  energy: number | null | undefined,
  t: T,
): SpellBlock | null {
  if (!entry.active) return { text: t("braid.spell_off"), waiting: false };
  if (entry.reasonKey && entry.reasonKey !== "spell.cooldown")
    return { text: t(entry.reasonKey, entry.reasonParams), waiting: false };
  // energy = undefined — баланс ещё едет; блокировать до его приезда нельзя,
  // иначе книга открывается сплошь серой. Отказ в этом случае даст сервер.
  if (typeof energy === "number" && energy < entry.energyCost)
    return { text: t("spell.no_energy", { cost: entry.energyCost }), waiting: false };
  if (entry.cooldownLeftSec > 0)
    return {
      text: t("braid.spell_cd_left", { time: cooldownClock(entry.cooldownLeftSec) }),
      waiting: true,
    };
  return null;
}
