// Архив картинок игры (владелец, 06.10.2026): все изображения YupLink с
// названиями — для открытой страницы, откуда их скачивают ZIP-архивом.
//
// Открыто всем, без входа: отдаём только имя и адрес картинки — то, что игра и
// так показывает каждому. Список живой: новая картинка в справочнике появится в
// архиве сама, через минуту кэша. В архив идёт только то, что в игре: шаблоны
// с active = false, выключенные паки и заклинания не попадают.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../db/mcpClient";
import { RESOURCE_LIST } from "@/lib/resourceIcons";
import { HERO_KNIGHT_SRC, HERO_SPRITES, heroSpriteSrc } from "@/lib/gameArt";
import { skinDisplayName } from "@/lib/skinName";
import type { ArchiveCat, ArchiveItem } from "@/lib/mediaArchive";

const TTL_MS = 60_000;
let cache: { at: number; items: ArchiveItem[] } | null = null;

const HERO_SPRITE_RU: Record<string, string> = {
  bee: "Пчела",
  boar: "Кабан",
  dracat: "Дракот",
  dragon: "Дракон",
  unicorn: "Единорог",
  yupik: "Юпик",
};

const SHIP_RU: Record<string, string> = {
  free: "свободный",
  mine: "свой",
  other: "чужой",
  dead: "без хода",
};

/** Картинки, которые лежат файлами приложения, а не в справочниках. */
function staticItems(): ArchiveItem[] {
  const out: ArchiveItem[] = RESOURCE_LIST.map((r) => ({
    key: `resource:${r.code}`,
    cat: "resource" as ArchiveCat,
    sub: null,
    name: r.ru,
    url: r.src,
  }));
  out.push({
    key: "sprite:knight",
    cat: "sprite",
    sub: null,
    name: "Рыцарь",
    url: HERO_KNIGHT_SRC,
  });
  for (const s of HERO_SPRITES) {
    out.push({
      key: `sprite:${s}`,
      cat: "sprite",
      sub: null,
      name: HERO_SPRITE_RU[s] ?? s,
      url: heroSpriteSrc(s),
    });
  }
  for (const [look, ru] of Object.entries(SHIP_RU)) {
    out.push({
      key: `sprite:ship-${look}`,
      cat: "sprite",
      sub: null,
      name: `Корабль — ${ru}`,
      url: `/ships/${look}.webp`,
    });
    out.push({
      key: `sprite:big-ship-${look}`,
      cat: "sprite",
      sub: null,
      name: `Большой корабль — ${ru}`,
      url: `/ships/big-${look}.webp`,
    });
  }
  return out;
}

/** Всё из справочников одним запросом: категория, подгруппа, имя, адрес. */
async function dbItems(): Promise<ArchiveItem[]> {
  const rows = (await mcpExec(
    `SELECT cat, sub, name, url, id, base FROM (
       SELECT kind AS cat, NULL::text AS sub, name, image_url AS url, id, NULL::text AS base
         FROM yuplink.mystic_item_template WHERE active
          AND kind IN ('terrain','road','building','decoration','chest','hero','artifact')
       UNION ALL
       SELECT 'skin', g.name, s.name, s.image, s.id, t.name
         FROM yuplink.raid_building_skin s
         LEFT JOIN yuplink.raid_building_group g ON g.id = s.group_id
         LEFT JOIN yuplink.mystic_item_template t ON t.id = g.template_id
       UNION ALL
       SELECT 'boss', NULL, name, image_url, id, NULL FROM yuplink.raid_boss_template
       UNION ALL
       SELECT 'boss', NULL, name || ' (на карте)', map_image_url, id || ':map', NULL
         FROM yuplink.raid_boss_template
        WHERE map_image_url IS DISTINCT FROM image_url
       UNION ALL
       SELECT 'custom', k.name, c.name, c.image, c.id, NULL
         FROM yuplink.raid_custom_item c
         LEFT JOIN yuplink.raid_item_category k ON k.id = c.category_id
       UNION ALL
       SELECT 'pack', NULL, name, cover_image_url, id, NULL FROM yuplink.chip_packs WHERE active
       UNION ALL
       SELECT 'chip', NULL, name, image_url, id, NULL FROM yuplink.chip_templates
       UNION ALL
       SELECT 'spell', NULL, name, image, id, NULL FROM yuplink.raid_spell WHERE active
       UNION ALL
       SELECT 'castle', NULL, name, image_url, id, NULL
         FROM yuplink.castle_terrain_template WHERE active
       UNION ALL
       SELECT 'location', NULL, name, image_url, id, NULL FROM yuplink.raid_location WHERE active
     ) x
     WHERE url IS NOT NULL AND url <> '' AND name IS NOT NULL
     ORDER BY cat, sub NULLS FIRST, lower(name);`,
    { wrapJson: true },
  )) as Array<{
    cat: string;
    sub: string | null;
    name: string;
    url: string;
    id: string;
    base: string | null;
  }>;
  return (rows ?? []).map((r) => ({
    key: `${r.cat}:${r.id}`,
    cat: r.cat as ArchiveCat,
    sub: r.sub ?? null,
    // Облик подписываем как в игре: «Ратуша единорогов», а не имя файла.
    name:
      r.cat === "skin"
        ? skinDisplayName(String(r.name), r.base ?? r.sub ?? "Облик")
        : String(r.name),
    url: String(r.url),
  }));
}

export async function archiveItems(): Promise<ArchiveItem[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.items;
  const items = [...(await dbItems()), ...staticItems()];
  cache = { at: Date.now(), items };
  return items;
}

export const getMediaArchive = createServerFn({ method: "GET" }).handler(
  async (): Promise<ArchiveItem[]> => archiveItems(),
);
