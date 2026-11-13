// Рынок героев: SQL окна «Выставить» — свои герои с признаками занятости — и
// первая причина отказа (в том же порядке, что проверяет hero_market_list).
// Текстом — чтобы проверялось тестом и на живой базе.
import { sqlStr } from "@/server/api/raid-shared";
import { isHeroMarketRarity, type HeroMarketRarity } from "@/lib/heroMarket";
import type { PocketDrop, PocketMove } from "@/server/api/hero-market/hm-pockets-plan";

/** Свой герой в окне «Выставить»: можно ли и почему нет (ключ словаря). */
export type SellableHero = {
  itemId: string;
  heroId: string | null;
  templateId: string;
  name: string;
  imageUrl: string | null;
  race: string | null;
  specialization: string | null;
  rarity: HeroMarketRarity | "common";
  level: number;
  /** Сколько стопок в карманах (рюкзак + сумка зелий). */
  pockets: number;
  /** Превью на сейчас: что уедет в рюкзак основного героя. */
  toMain: PocketMove[];
  /**
   * Превью: что не влезет основному (мешочек / сгорит / гриб встанет сам). Не
   * пусто — до нажатия показать окно «выпадет в мешочек».
   */
  drops: PocketDrop[];
  /** Ключ согласия на эти drops: принял окно — слать у героя acceptKey = dropsKey. "" — окна нет. */
  dropsKey: string;
  canList: boolean;
  reason: string | null;
  restUntil: string | null;
};

export type SellableRow = Omit<
  SellableHero,
  "canList" | "reason" | "rarity" | "toMain" | "drops" | "dropsKey"
> & {
  rarity: string;
  active: boolean;
  resting: boolean;
  field: boolean;
  fishing: boolean;
};

export function sellableSql(account: string): string {
  const acc = sqlStr(account);
  return `SELECT u.id AS "itemId", h.id AS "heroId", u.template_id AS "templateId", t.name,
         t.image_url AS "imageUrl", t.race, t.specialization,
         yuplink.hero_market_rarity(t.level) AS rarity, COALESCE(h.level, 0)::int AS level,
         (h.selected_at IS NOT NULL) AS active,
         COALESCE(h.rest_until > now(), false) AS resting,
         CASE WHEN h.rest_until > now() THEN h.rest_until END AS "restUntil",
         EXISTS (SELECT 1 FROM yuplink.raid_field_worker fw WHERE fw.hero_id = h.id) AS field,
         EXISTS (SELECT 1 FROM yuplink.raid_fishing fi
                  WHERE fi.hero_id = h.id AND fi.stopped_at IS NULL) AS fishing,
         COALESCE(bp.n, 0)::int AS pockets
    FROM yuplink.user_game_item u
    JOIN yuplink.mystic_item_template t ON t.id = u.template_id
    LEFT JOIN yuplink.hero_instance h ON h.item_id = u.id
    LEFT JOIN LATERAL (
      SELECT count(*) AS n
        FROM yuplink.raid_hero_backpack b WHERE b.hero_id = h.id AND b.count > 0
    ) bp ON true
   WHERE u.account_id = ${acc} AND u.kind = 'hero'
   ORDER BY COALESCE(t.level, 0) DESC, COALESCE(h.level, 0) DESC, t.name, u.id
   LIMIT 300`;
}

/**
 * Первая причина отказа — в том же порядке, что проверяет функция базы.
 * Карманы: гриб, а основного нет, — грибу некуда (dmine_no_main); что-то не
 * влезает (без основного — всё), а игрока нет на карте, — некуда уронить.
 * Всё влезает — позиция не нужна.
 */
export function sellableReason(
  r: SellableRow,
  o: { onMap: boolean; hasMain: boolean; drops: number; mushrooms: boolean },
): string | null {
  if (!isHeroMarketRarity(r.rarity)) return "heromkt.common";
  if (r.active) return "heromkt.active";
  if (r.resting) return "heromkt.resting";
  if (r.field) return "heromkt.field";
  if (r.fishing) return "heromkt.fishing";
  if (r.pockets > 0 && !o.hasMain && o.mushrooms) return "heromkt.dmine_no_main";
  if (r.pockets > 0 && o.drops > 0 && !o.onMap) return "heromkt.no_position";
  return null;
}
