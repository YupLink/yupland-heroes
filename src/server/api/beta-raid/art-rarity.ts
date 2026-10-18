// «Артефакт по редкости» — псевдо-шаблон вида art_any_<rarity>. Пикер маркета
// (MarketRefPicker.ART_ANY) кладёт его в refId ТОВАРА (kind='art') и в
// priceToken ЦЕНЫ (priceResource='art'). Здесь резолвим его в реальный шаблон
// или реальный стек рюкзака.
//
// Одна причина держать это отдельным модулем: и market-deliver (выдача), и
// market-money.spend (оплата) зовут одну и ту же логику — если формулу
// «редкость → шаблон» размазать по двум местам, они разъедутся первым же
// ретюном шаблонов, и клиент увидит «не хватает арта», когда у игрока лежит
// ровно то, что просили.
//
// Сами экземпляры артефактов живут в инвентаре (art-stock.ts), не в рюкзаке
// героя: поиск «чем заплатить» — там, здесь только разбор псевдо-шаблона.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export type ArtRarity = "common" | "rare" | "epic" | "legendary";

const ANY_RE = /^art_any_(common|rare|epic|legendary)$/;

/** true → refId — псевдо-«любой арт редкости X». */
export function isArtAny(refId: string | null | undefined): refId is `art_any_${ArtRarity}` {
  return !!refId && ANY_RE.test(refId);
}

export function artAnyRarity(refId: string): ArtRarity | null {
  const m = refId.match(ANY_RE);
  return m ? (m[1] as ArtRarity) : null;
}

/**
 * Случайный АКТИВНЫЙ шаблон-артефакт нужной редкости — для ВЫДАЧИ товара.
 * Пусто → каталог этой редкости пуст: сообщаем человечно.
 */
export async function pickArtTemplateByRarity(
  rarity: ArtRarity,
): Promise<{ id: string; name: string; image: string | null }> {
  const rows = (await mcpExec(
    `SELECT id, name, image_url AS image
       FROM yuplink.mystic_item_template
      WHERE kind = 'artifact' AND active = true AND rarity = ${sqlStr(rarity)}
      ORDER BY random() LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string; name: string; image: string | null }>;
  const row = rows?.[0];
  if (!row?.id) throw new Error("market.art_rarity_empty");
  return { id: row.id, name: row.name, image: row.image ?? null };
}
