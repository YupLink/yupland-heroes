// Облики построек: категория картинок + функция.
//
// Раньше каждый вид требовал своего шаблона: «Магазин единорога», «Магизин
// кабанов», «Пчелинный магазин» — три постройки с одной механикой. С городами
// таких стало бы под тысячу, и нужную приходилось выискивать глазами.
//
// Теперь так: категория («Храмы») — это папка картинок с базовой функцией.
// Картинка меняет только вид и подпись клетки; что постройка ДЕЛАЕТ, решает
// её шаблон (building_id), и его можно перевыбрать отдельно.
//
// Клиенту облик приезжает в том же словаре построек, что и шаблоны, — под
// собственным ключом `skin:<id>`: карта рисует картинку и имя, а сервер по
// нему ничего не ищет.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export type BuildingSkin = { id: string; groupId: string; name: string; image: string };
export type BuildingGroup = {
  id: string;
  name: string;
  /** Базовая функция: шаблон, который ставится на клетку вместе с обликом. */
  templateId: string | null;
  skins: BuildingSkin[];
};

/** Префикс облика в словаре построек — по нему клиент отличает его от шаблона. */
export const SKIN_PREFIX = "skin:";
export const skinKey = (id: string): string => `${SKIN_PREFIX}${id}`;
export const skinIdOf = (key: string): string | null =>
  key.startsWith(SKIN_PREFIX) ? key.slice(SKIN_PREFIX.length) : null;

const toSkin = (r: Record<string, unknown>): BuildingSkin => ({
  id: String(r.id),
  groupId: String(r.group_id),
  name: String(r.name ?? ""),
  image: String(r.image ?? ""),
});

/** Все категории с их картинками — этим живёт окно выбора в режиме бога. */
export async function listGroups(): Promise<BuildingGroup[]> {
  const [groups, skins] = (await Promise.all([
    mcpExec(`SELECT id, name, template_id FROM yuplink.raid_building_group ORDER BY name;`, {
      wrapJson: true,
    }).catch(() => []),
    mcpExec(
      `SELECT id, group_id, name, image FROM yuplink.raid_building_skin
        ORDER BY created_at, name;`,
      { wrapJson: true },
    ).catch(() => []),
  ])) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];

  const byGroup = new Map<string, BuildingSkin[]>();
  for (const row of skins ?? []) {
    const s = toSkin(row);
    const list = byGroup.get(s.groupId) ?? [];
    list.push(s);
    byGroup.set(s.groupId, list);
  }
  return (groups ?? []).map((g) => ({
    id: String(g.id),
    name: String(g.name ?? ""),
    templateId: g.template_id ? String(g.template_id) : null,
    skins: byGroup.get(String(g.id)) ?? [],
  }));
}

/** Облики по списку id — для словаря карты. */
export async function skinsByIds(ids: string[]): Promise<BuildingSkin[]> {
  const clean = [...new Set(ids.filter(Boolean))];
  if (clean.length === 0) return [];
  const rows = (await mcpExec(
    `SELECT id, group_id, name, image FROM yuplink.raid_building_skin
      WHERE id IN (${clean.map((i) => sqlStr(i)).join(",")});`,
    { wrapJson: true },
  ).catch(() => [])) as Array<Record<string, unknown>>;
  return (rows ?? []).map(toSkin);
}

/** Завести категорию: имя и базовая функция (шаблон постройки). */
export async function addGroup(name: string, templateId: string | null): Promise<BuildingGroup> {
  const id = `bgrp_${nanoid(8)}`;
  await mcpExec(
    `INSERT INTO yuplink.raid_building_group (id, name, template_id)
     VALUES (${sqlStr(id)}, ${sqlStr(name)}, ${templateId ? sqlStr(templateId) : "NULL"});`,
  );
  return { id, name, templateId, skins: [] };
}

/** Сменить имя категории или её базовую функцию. */
export async function updateGroup(
  id: string,
  patch: { name?: string; templateId?: string | null },
): Promise<void> {
  const sets: string[] = [];
  if (patch.name != null) sets.push(`name = ${sqlStr(patch.name)}`);
  if (patch.templateId !== undefined)
    sets.push(`template_id = ${patch.templateId ? sqlStr(patch.templateId) : "NULL"}`);
  if (sets.length === 0) return;
  await mcpExec(
    `UPDATE yuplink.raid_building_group SET ${sets.join(", ")} WHERE id = ${sqlStr(id)};`,
  );
}

/** Удалить категорию вместе с её картинками (клетки вернутся к базовому виду). */
export async function removeGroup(id: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.raid_map_cells SET building_skin_id = NULL
      WHERE building_skin_id IN (SELECT id FROM yuplink.raid_building_skin
                                  WHERE group_id = ${sqlStr(id)});`,
  );
  await mcpExec(`DELETE FROM yuplink.raid_building_group WHERE id = ${sqlStr(id)};`);
}

/** Добавить картинки в категорию пачкой: у облика только имя и картинка. */
export async function addSkins(
  groupId: string,
  items: Array<{ name: string; image: string }>,
): Promise<BuildingSkin[]> {
  const good = items.filter((i) => i.image && i.name);
  if (good.length === 0) return [];
  const rows = good.map((i) => ({ id: `bskin_${nanoid(10)}`, ...i }));
  const values = rows
    .map((r) => `(${sqlStr(r.id)}, ${sqlStr(groupId)}, ${sqlStr(r.name)}, ${sqlStr(r.image)})`)
    .join(",");
  await mcpExec(
    `INSERT INTO yuplink.raid_building_skin (id, group_id, name, image) VALUES ${values};`,
  );
  return rows.map((r) => ({ id: r.id, groupId, name: r.name, image: r.image }));
}

/** Переименовать конкретный облик — только его подпись в палитре. */
export async function renameSkin(id: string, name: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.raid_building_skin SET name = ${sqlStr(name)}
      WHERE id = ${sqlStr(id)};`,
  );
}

/**
 * Убрать облик. Клетки, где он стоял, возвращаются к базовому виду шаблона —
 * иначе остались бы со ссылкой в никуда и нарисовались пустыми.
 */
export async function removeSkin(id: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.raid_map_cells SET building_skin_id = NULL
      WHERE building_skin_id = ${sqlStr(id)};`,
  );
  await mcpExec(`DELETE FROM yuplink.raid_building_skin WHERE id = ${sqlStr(id)};`);
}

/** Итог клетки после смены облика — для мгновенного патча кэша карты у клиента. */
export type CellSkinState = {
  /** Настоящий building_id (шаблон), а не ключ облика. */
  buildingId: string | null;
  skinId: string | null;
  /** Имя БАЗОВОЙ постройки: клетка подписывается им, а не именем облика. */
  name: string | null;
  /** Картинка облика (для базового вида — null, берётся у шаблона). */
  image: string | null;
  tiers: number;
};

/**
 * Поставить облик на клетку. `null` («база») — снять ТОЛЬКО облик, постройка
 * остаётся с базовым видом шаблона. Целиком постройку убирает кнопка «убрать»
 * (она же снимает облик). Функцию стоящей постройки облик не трогает — меняет
 * только внешность. Возвращает итог клетки для оптимистичного показа.
 */
export async function setCellSkin(
  mapId: string,
  q: number,
  r: number,
  skinId: string | null,
): Promise<CellSkinState> {
  if (!skinId) {
    // Снимаем только облик. Раньше «база» сносила building_id и config — и на
    // клетке, где сперва застроили, а потом переоделись, стирала саму постройку
    // (жалоба «переодел — а постройка пропала»). Убирать постройку — дело кнопки
    // «убрать», она же снимает облик.
    await mcpExec(
      `UPDATE yuplink.raid_map_cells SET building_skin_id = NULL
        WHERE map_id = ${sqlStr(mapId)} AND q = ${q} AND r = ${r};`,
    );
  } else {
    await mcpExec(
      `UPDATE yuplink.raid_map_cells c
          SET building_skin_id = s.id,
              building_id = COALESCE(c.building_id, g.template_id)
         FROM yuplink.raid_building_skin s
         JOIN yuplink.raid_building_group g ON g.id = s.group_id
        WHERE s.id = ${sqlStr(skinId)}
          AND c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r};`,
    );
  }
  const rows = (await mcpExec(
    `SELECT c.building_id AS "buildingId", c.building_skin_id AS "skinId",
            t.name AS name,
            jsonb_array_length(COALESCE(t.meta->'tiers', '[]'::jsonb)) AS tiers,
            sk.image AS image
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.building_id
       LEFT JOIN yuplink.raid_building_skin sk ON sk.id = c.building_skin_id
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{
    buildingId: string | null;
    skinId: string | null;
    name: string | null;
    tiers: number | null;
    image: string | null;
  }>;
  const row = rows?.[0];
  return {
    buildingId: row?.buildingId ?? null,
    skinId: row?.skinId ?? null,
    name: row?.name ?? null,
    image: row?.image ?? null,
    tiers: Number(row?.tiers) || 1,
  };
}
