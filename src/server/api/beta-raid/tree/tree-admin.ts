// Товар «Дерево» в лавке (lib/treePlant): что админ может выставить и проверка
// позиции при сохранении. Цену задаёт админ в той же форме и тех же полях, что
// у любого товара лавки (MarketItemForm); пока позиция не сохранена — дерева в
// продаже нет.
//
//  · список — живые шаблоны декора с действием «Срубить» / «Chop»;
//  · позиция — только витрина покупки (игрок покупает и сажает; скупки деревьев
//    владелец не просил), только срубаемое дерево; имя — имя шаблона (по нему
//    стопка в рюкзаке и английский перевод), картинка — своя, если админ задал
//    замену, иначе шаблона.
//
// «Камень для установки» (rock, владелец 25.10.2026) — то же самое для декора,
// который бьют киркой (горы, камни, кристаллы; tree-cell-sql pickRockSql).
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { getCurrentWallet, isAdminWallet } from "@/server/auth";
import { parseDecorInteract } from "@/lib/raid/decorInteract";
import { isChoppableInteract, ROCK_KIND, TREE_KIND, type PlantKind } from "@/lib/treePlant";
import { plantableSql } from "@/server/api/beta-raid/tree/tree-cell-sql";
import { requireDesigner } from "@/server/api/beta-raid/island/island-editor-auth";

type TplRow = { id: string; name: string | null; image_url: string | null; interact: unknown };

/** Шаблон дерева или камня для витрины: id, имя, картинка. */
export type PlantableTree = { id: string; name: string; imageUrl: string | null };

const listSql = (kind: PlantKind, where: string): string =>
  `SELECT d.id, d.name, d.image_url, d.meta->'interact' AS interact
     FROM yuplink.mystic_item_template d
    WHERE ${plantableSql(kind, "d")}${where}
    ORDER BY d.name, d.id;`;

/**
 * Годные шаблоны вида. Дерево: SQL — грубо, isChoppableInteract — точно, как у
 * рубки. Камень: кирку проверил SQL, здесь — что взаимодействие настроено.
 */
async function loadPlantables(kind: PlantKind, where = ""): Promise<PlantableTree[]> {
  const rows = ((await mcpExec(listSql(kind, where), { wrapJson: true })) ?? []) as TplRow[];
  return rows
    .filter((r) =>
      kind === TREE_KIND ? isChoppableInteract(r.interact) : !!parseDecorInteract(r.interact),
    )
    .map((r) => ({
      id: String(r.id),
      name: String(r.name ?? r.id),
      imageUrl: r.image_url ?? null,
    }));
}

const requireMarketAdmin = (): void => {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Маркет настраивает только админ");
};

/** Список для пикера «Что именно» (только админ). */
export const listPlantableTrees = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlantableTree[]> => {
    await requireDesigner();
    return loadPlantables(TREE_KIND);
  },
);

/** Камни и горы под кирку — пикер «Что именно» у «Камня для установки» (только админ). */
export const listPlaceableRocks = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlantableTree[]> => {
    await requireDesigner();
    return loadPlantables(ROCK_KIND);
  },
);

/** Позиция формы — ровно то, что читает проверка. */
type TreeGoodInput = {
  kind: string;
  side: string;
  refId: string | null;
  giveAmount: number;
  name: string;
  image: string | null;
};

/** Годный шаблон вида по id или undefined. */
const plantableById = async (
  kind: PlantKind,
  refId: string | null,
): Promise<PlantableTree | undefined> => {
  const id = (refId ?? "").trim();
  return id ? (await loadPlantables(kind, ` AND d.id = ${sqlStr(id)}`))[0] : undefined;
};

/** Отказы админу по виду. */
const ADMIN_ERR: Record<PlantKind, { side: string; none: string }> = {
  tree: {
    side: "Дерево для посадки ставится только в витрину покупки",
    none: "Выбери срубаемое дерево — шаблон декора с действием «Срубить»",
  },
  rock: {
    side: "Камень для установки ставится только в витрину покупки",
    none: "Выбери камень — шаблон декора, который бьют киркой",
  },
};

/**
 * Позиция-дерево (или камень): отказ админу до записи, если её нельзя исполнить;
 * иначе имя (и картинка, если своей нет) — от шаблона. Прочие виды не трогает.
 * За покупку — одна штука: рюкзак кладёт штуку на единицу сделки, а «Сколько»
 * от прошлого вида (форма его прячет) показало бы на плитке «×5» за одну.
 */
export async function applyTreeGood(data: TreeGoodInput): Promise<void> {
  const kind = data.kind === TREE_KIND || data.kind === ROCK_KIND ? data.kind : null;
  if (!kind) return;
  if (data.side !== "buy") throw new Error(ADMIN_ERR[kind].side);
  const tpl = await plantableById(kind, data.refId);
  if (!tpl) throw new Error(ADMIN_ERR[kind].none);
  data.name = tpl.name;
  data.image = data.image || tpl.imageUrl;
  data.giveAmount = 1;
}

/**
 * Покупка дерева (камня) — до денег: шаблон всё ещё годен. Админ мог снять
 * «Срубить» (кирку) или удалить шаблон уже после выставления (или развернуть
 * старый шаблон маркета) — такое не поставить, и платить за него нельзя.
 */
export async function assertTreeForSale(
  refId: string | null,
  kind: PlantKind = TREE_KIND,
): Promise<void> {
  if (!(await plantableById(kind, refId))) {
    throw new Error(kind === ROCK_KIND ? "rock.gone_kind" : "tree.gone_kind");
  }
}
