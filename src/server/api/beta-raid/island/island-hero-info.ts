// Герой острова для окна результата выбора расы (26.10.2026, Ангелина): какой
// герой фактически у аккаунта — тот, что выдан сейчас, или прежний (обучение с
// нуля: второго не выдаём, alreadyHad). Только чтение.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { metaLabel } from "@/components/heroMeta";
import { dict as tagLabels } from "@/lib/translations/braid-tags";
import { rarityOfTemplateLevel } from "@/server/api/heroes-list-dormant";
import type { HeroRarity } from "@/lib/heroLevels";
import { heroItemSql } from "./island-gift";

type Label = { id: string; ru: string; en: string };

export type IslandHeroGranted = {
  /** Предмет героя (ugi_isle_…) — один на аккаунт. */
  itemId: string;
  /** Экземпляр героя; null — герой «спит» (не основной, не будили). */
  instanceId: string | null;
  templateId: string;
  /** Имя из справочника; перевода имён героев нет — ru и en одинаковые. */
  name: { ru: string; en: string };
  image: string | null;
  rarity: { id: HeroRarity; ru: string; en: string };
  specialization: Label | null;
  race: Label | null;
  /** Стал основным (рюкзак прежнего основного был пуст). */
  main: boolean;
  /** Героя уже выдавали раньше — сейчас ничего не выдано. */
  alreadyHad: boolean;
};

type Row = {
  item_id: string;
  instance_id: string | null;
  template_id: string;
  name: string | null;
  image_url: string | null;
  race: string | null;
  specialization: string | null;
  level: number | string | null;
  inst_rarity: string | null;
  main: boolean | string | null;
};

const RARITIES: readonly HeroRarity[] = ["common", "rare", "epic", "legendary"];

const meta = (v: string | null): Label | null =>
  v ? { id: v, ru: metaLabel(v, "ru"), en: metaLabel(v, "en") } : null;

const race = (v: string | null): Label | null => {
  if (!v) return null;
  const t = tagLabels[`tags.race.${v}`];
  return { id: v, ru: t?.ru ?? v, en: t?.en ?? v };
};

/** Сборка ответа из строки базы (чистая — для тестов). */
export function heroGrantedOf(r: Row, alreadyHad: boolean): IslandHeroGranted {
  const inst = RARITIES.find((x) => x === r.inst_rarity);
  const rarity = inst ?? rarityOfTemplateLevel(Number(r.level));
  const name = r.name ?? "Герой";
  return {
    itemId: r.item_id,
    instanceId: r.instance_id ?? null,
    templateId: r.template_id,
    name: { ru: name, en: name },
    image: r.image_url ?? null,
    rarity: { id: rarity, ru: metaLabel(rarity, "ru"), en: metaLabel(rarity, "en") },
    specialization: meta(r.specialization),
    race: race(r.race),
    main: r.main === true || r.main === "t",
    alreadyHad,
  };
}

/** Герой острова аккаунта (предмет ugi_isle_…); нет — null. */
export async function islandHeroOf(
  account: string,
  alreadyHad: boolean,
): Promise<IslandHeroGranted | null> {
  const rows = (await mcpExec(
    `SELECT u.id AS item_id, h.id AS instance_id, u.template_id, t.name, t.image_url,
            t.race, t.specialization, t.level, h.rarity AS inst_rarity,
            (h.selected_at IS NOT NULL) AS main
       FROM yuplink.user_game_item u
       JOIN yuplink.mystic_item_template t ON t.id = u.template_id
       LEFT JOIN yuplink.hero_instance h ON h.item_id = u.id
      WHERE u.id = ${heroItemSql(account)} AND u.account_id = ${sqlStr(account)}
      LIMIT 1;`,
    { wrapJson: true },
  )) as Row[];
  const r = rows?.[0];
  return r ? heroGrantedOf(r, alreadyHad) : null;
}
