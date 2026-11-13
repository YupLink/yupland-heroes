// Товар «Земля» в лавке (lib/landPlace): что админ может выставить и проверка
// позиции при сохранении. Цену и «Сколько» (клеток в пачке) задаёт админ в той
// же форме, что у любого товара лавки (MarketItemForm).
//
//  · список — все живые шаблоны местности, и будущие тоже (тот же справочник);
//  · позиция — только витрина покупки; имя — имя местности (по нему стопка в
//    рюкзаке), картинка — своя, если админ задал замену, иначе местности;
//  · пачка — целое число клеток, не меньше одной.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { getCurrentWallet, isAdminWallet } from "@/server/auth";
import { LAND_KIND } from "@/lib/landPlace";
import { requireDesigner } from "@/server/api/beta-raid/island/island-editor-auth";

/** Местность для витрины: id, имя, картинка. */
export type LandTerrain = { id: string; name: string; imageUrl: string | null };

const listSql = (where = ""): string =>
  `SELECT t.id, t.name, t.image_url
     FROM yuplink.mystic_item_template t
    WHERE t.kind = 'terrain' AND COALESCE(t.active, true)${where}
    ORDER BY t.name, t.id;`;

async function loadTerrains(where = ""): Promise<LandTerrain[]> {
  const rows = ((await mcpExec(listSql(where), { wrapJson: true })) ?? []) as Array<{
    id: string;
    name: string | null;
    image_url: string | null;
  }>;
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? r.id),
    imageUrl: r.image_url ?? null,
  }));
}

/** Список для пикера «Что именно» (только админ). */
export const listLandTerrains = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandTerrain[]> => {
    await requireDesigner();
    return loadTerrains();
  },
);

const terrainById = async (refId: string | null): Promise<LandTerrain | undefined> => {
  const id = (refId ?? "").trim();
  return id ? (await loadTerrains(` AND t.id = ${sqlStr(id)}`))[0] : undefined;
};

/** Позиция формы — ровно то, что читает проверка. */
type LandGoodInput = {
  kind: string;
  side: string;
  refId: string | null;
  giveAmount: number;
  name: string;
  image: string | null;
};

/**
 * Позиция-земля: отказ админу до записи, если её нельзя исполнить; иначе имя
 * (и картинка, если своей нет) — от местности. Прочие виды не трогает.
 */
export async function applyLandGood(data: LandGoodInput): Promise<void> {
  if (data.kind !== LAND_KIND) return;
  if (data.side !== "buy") throw new Error("Земля ставится только в витрину покупки");
  if (!Number.isInteger(data.giveAmount) || data.giveAmount < 1) {
    throw new Error("Клеток в пачке — целое число, не меньше 1");
  }
  const t = await terrainById(data.refId);
  if (!t) throw new Error("Выбери местность");
  data.name = t.name;
  data.image = data.image || t.imageUrl;
}

/** Покупка земли — до денег: местность всё ещё живая (админ мог её выключить). */
export async function assertLandForSale(refId: string | null): Promise<void> {
  if (!(await terrainById(refId))) throw new Error("land.gone_kind");
}
