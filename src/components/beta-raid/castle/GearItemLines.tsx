// Разбор одного артефакта построчно: что написано НА ПРЕДМЕТЕ и что из этого
// достанется ЭТОМУ герою.
//
// Владелец не мог понять, работает ли «Специализация Маг +2» на его
// Кабане-Воине: карточка показывала одну слипшуюся строку прибавок. Теперь у
// каждой строки своя скобка — зелёная «(+2)» значит «пошло в дело», красная
// «(+0)» — «условие не совпало», но само «+2» видно, чтобы предмет не выглядел
// пустым.
//
// Своей формулы здесь нет вовсе: parts и total приходят с сервера из
// explainGear — той же функции, через которую герой считается в бою. Пока
// разбор считался ещё и на клиенте, две реализации одного правила жили рядом
// и ждали, когда разойтись; верил бы игрок карточке, а бил бы бой.
import { useLang, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { metaLabel } from "@/components/heroMeta";
import { StatBadge } from "@/components/itemStat";
import { fishBonusText } from "@/lib/raid/fishBonus";
import { artDisabled, shownArtPct } from "@/lib/hero/artWear";
import type { GearItemView } from "@/server/api/heroes-gear";
import { MountLine } from "./MountLine";

/** Строка словаря для условной части. base считается отдельно — там нет label. */
const PART_KEY: Record<string, string> = {
  spec: "braid.gear_line_spec",
  race: "braid.gear_line_race",
  land: "braid.gear_line_land",
};

/** Подпись к небоевому стату: что он растит у героя. */
const EXTRA_HINT: Record<string, string> = {
  trade: "braid.gear_trade_hint",
  alchemy: "braid.gear_alchemy_hint",
};

export function GearItemLines({ item }: { item: GearItemView }) {
  const t = useT();
  const lang = useLang();

  const stat = metaLabel(item.statType, lang);
  const immun = item.immunities.filter((i) => !!i);
  // Старый ответ из кэша поля не знает — тогда бонуса просто нет.
  const fish = fishBonusText(Number(item.fishBonusPct) || 0, lang === "en" ? "en" : "ru");

  // «Торговля» и «Алхимия» — НЕбоевые статы: explainGear считает их так же
  // (база + раса + спека), но растят они рюкзак и сумку зелий, а не силу в
  // бою — говорим об этом подписью под разбором.
  const extraHint = EXTRA_HINT[(item.statType ?? "").trim().toLowerCase()];
  // Выключенный поломкой (artDisabled) иммунитетов и рыбалки не даёт — строки
  // гаснут. Пока ремонта нет — сломанный горит, как целый.
  const off = artDisabled(100 - shownArtPct(item.durability));
  const live = off ? "text-muted-foreground" : "text-success";

  return (
    <div className="space-y-0.5 text-[10px] leading-tight">
      {/* Зачарование коня множит его скорость (03.11.2026) — строка уже с ним. */}
      <MountLine mount={item.mount} pct={Number(item.enchantPct) || 0} />
      {item.parts.length === 0 && immun.length === 0 && !item.mount && (
        <div className="text-muted-foreground">{t("braid.gear_no_stat")}</div>
      )}
      {item.parts.map((p) => {
        const text =
          p.kind === "base"
            ? t("braid.gear_line_main", { n: p.amount, stat })
            : t(PART_KEY[p.kind], { name: metaLabel(p.label, lang), n: p.amount });
        // Земельный бонус зависит от клетки под ногами, а в замке клетка одна —
        // скобку не рисуем вовсе, иначе рабочий бонус получил бы красное «(+0)».
        const land = p.kind === "land";
        const got = p.applied ? p.amount : 0;
        return (
          <div key={`${p.kind}:${p.label ?? ""}`} className="flex flex-wrap items-baseline gap-x-1">
            <span className={land ? "text-muted-foreground" : "text-foreground/80"}>{text}</span>
            {!land && (
              <span className={cn("font-bold", got > 0 ? "text-success" : "text-destructive")}>
                (+{got})
              </span>
            )}
          </div>
        );
      })}
      {immun.length > 0 && (
        <div className={live}>
          {t("braid.gear_immune_line", {
            list: immun.map((i) => metaLabel(i, lang)).join(", "),
          })}
        </div>
      )}
      {/* Бонус к рыбалке — проценты к шансу поимки; нет его — строки нет. */}
      {fish && <div className={live}>{t("braid.gear_fish_line", { n: fish })}</div>}
      {/* Итог. Предмет с одними иммунитетами не «пустой» — про него молчим. */}
      {item.total > 0 || fish ? (
        item.total > 0 ? (
          <div className="font-bold text-success">
            {t("braid.gear_total_for_hero", { n: item.total, stat })}
          </div>
        ) : null
      ) : immun.length === 0 && !item.mount ? (
        <div className="text-muted-foreground">{t("braid.gear_total_zero")}</div>
      ) : null}
      {extraHint && <div className="text-muted-foreground">{t(extraHint)}</div>}
    </div>
  );
}
