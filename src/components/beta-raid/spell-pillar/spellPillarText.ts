// Подписи окна столба: откат по-человечески и «что заклинание даёт».
//
// Отдельным модулем от компонентов: те же строки нужны и карточке в списке, и
// шапке окна, а держать перевод в двух местах — верный способ развести их.
import { boostListText, type BoostEffect } from "@/lib/hero/boost";
import type { Lang } from "@/lib/store";
import type { PortalPrice } from "@/lib/portal";
import { priceText } from "../portalPriceText";

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Вид заклинания — техническому эффекты не нужны, он и так понятен. */
type Kind =
  | "boost"
  | "summon_ship"
  | "teleport_town"
  | "create_ship"
  | "repair_ship"
  | "create_big_ship";

/** «45 мин», «4 ч», «1 ч 30 мин», «без отката». Минуты — то, что даёт сервер. */
export function cooldownText(minutes: number, t: TFn): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m <= 0) return t("spellpillar.no_cooldown");
  if (m < 60) return t("spellpillar.cd_min", { n: m });
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? t("spellpillar.cd_h", { n: h }) : t("spellpillar.cd_hm", { h, m: rest });
}

/**
 * Что заклинание даёт. У обычного — список эффектов теми же словами, что на
 * алтаре и в карточке зелья; у технического — одна фраза про его дело.
 */
export function giftText(
  spell: { kind: Kind; effects: BoostEffect[] },
  lang: Lang,
  t: TFn,
): string {
  if (spell.kind === "summon_ship") return t("spellpillar.kind_ship");
  if (spell.kind === "teleport_town") return t("spellpillar.kind_teleport");
  if (spell.kind === "create_ship") return t("spellpillar.kind_ship_create");
  if (spell.kind === "create_big_ship") return t("spellpillar.kind_big_ship_create");
  if (spell.kind === "repair_ship") return t("spellpillar.kind_ship_repair");
  return spell.effects.length > 0 ? boostListText(spell.effects, lang) : "";
}

/** Список цены из ответа — защищённо: вкладка могла сохранить ответ другой сборки. */
const pricesOf = (v: unknown): PortalPrice[] => (Array.isArray(v) ? (v as PortalPrice[]) : []);

/**
 * «Изучение: 100 золота · забвение: 50 золота». Пустая цена изучения — это не
 * «бесплатно», а ненастроенный столб: строки нет, отказ скажет всё сам. Пустая
 * цена забвения — у этого столба забыть нельзя, о ней ни слова.
 */
export function pillarPriceLine(learn: unknown, forget: unknown, t: TFn): string | null {
  const l = pricesOf(learn);
  if (l.length === 0) return null;
  const f = pricesOf(forget);
  const head = t("spellpillar.learn_price", { price: priceText(l, t) });
  return f.length > 0
    ? `${head} · ${t("spellpillar.forget_price", { price: priceText(f, t) })}`
    : head;
}
