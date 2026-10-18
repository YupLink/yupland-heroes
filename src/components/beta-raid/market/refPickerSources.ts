// Откуда пикер берёт шаблоны товаров: по типу — своя админская ручка со своей
// формой строки. Вынесено из MarketRefPicker (лимит ≤250 строк): загрузка
// данных и рисование попапа — разные заботы, и правят их по разным поводам.
import { adminListItems } from "@/server/api/items";
import { adminListBossTemplates } from "@/server/api/raid-admin";
import { adminListChipPacks } from "@/server/api/chips-admin";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";
import { artAnyIconSrc, artAnyRarity, heroRarityByLevel } from "./artAnyIcon";
import type { MarketKind } from "@/lib/marketItem";
import { parseBoostEffects, type BoostEffect } from "@/lib/hero/boost";
import { toolWearOf } from "@/lib/raid/toolWear";

// Описание есть только у своего товара — у остальных источников поле пустое,
// но держать его в общей форме дешевле, чем разводить два типа.
export type Ref = {
  id: string;
  name: string;
  image: string | null;
  description?: string | null;
  /**
   * Редкость шаблона. Админ настраивает цены артефактами десятками штук, и без
   * этого поля каждый раз ходил сверяться, что за предмет он выбрал.
   */
  rarity?: string | null;
  /** Настройка бустов своего товара — чтобы правка её не стирала. */
  boost?: BoostEffect[] | null;
  /** Галочка «зелье» своего товара — чтобы правка её не стирала. */
  isPotion?: boolean;
  /** Галочка «магический сундук» своего товара — чтобы правка её не стирала. */
  magicChest?: boolean;
  /** «Износ за удар, %» своего товара — чтобы правка его не стирала. */
  toolWear?: number | null;
  /** Галочка «лопата» своего товара — чтобы правка её не стирала. */
  isShovel?: boolean;
  /** Галочка «сундук» своего товара — чтобы правка её не стирала. */
  plainChest?: boolean;
  /** Категория своего товара (lib/itemCategories); null — «без категории». */
  categoryId?: string | null;
  /** Галочка «удочка» своего товара — чтобы правка её не стирала. */
  isRod?: boolean;
  /** Галочка «карта» своего товара — чтобы правка её не стирала. */
  isMap?: boolean;
};

function norm(row: unknown): Ref {
  const r = (row ?? {}) as Record<string, unknown>;
  // Источники зовут картинку по-разному: герои/арты/боссы отдают imageUrl,
  // а паки (adminListChipPacks) — обложку coverImageUrl. Без пака в цепочке
  // у КАЖДОГО пака рисовался плейсхолдер.
  const image =
    r.imageUrl ?? r.image_url ?? r.coverImageUrl ?? r.cover_image_url ?? r.image ?? null;
  // У артефакта редкость своя, у героя её задаёт ярус шаблона — приводим к
  // одной шкале, чтобы плитка красилась одинаково.
  const rarity =
    r.rarity != null
      ? String(r.rarity)
      : r.kind === "hero" || r.level != null
        ? heroRarityByLevel(Number(r.level))
        : null;
  return {
    id: String(r.id ?? ""),
    description: r.description == null ? null : String(r.description),
    name: String(r.name ?? r.title ?? r.id ?? ""),
    image: image != null ? String(image) : null,
    rarity,
    boost: parseBoostEffects(r.boost),
    isPotion: r.isPotion === true,
    magicChest: r.magicChest === true,
    toolWear: toolWearOf(r.toolWear),
    isShovel: r.isShovel === true,
    plainChest: r.plainChest === true,
    categoryId: r.categoryId == null ? null : String(r.categoryId),
    isRod: r.isRod === true,
    isMap: r.isMap === true,
  };
}

/** Псевдо-шаблоны «любой арт редкости X»: сервер понимает refId вида
 *  `art_any_<rarity>`. Полезны и как ТОВАР (выдать случайный арт нужной
 *  редкости), и как ЦЕНА (принять любой арт этой редкости).
 *  Картинка — корзина ломбарда цветом редкости (artAnyIcon): своего арта у
 *  такой позиции нет, и в списке она была безликим плейсхолдером. */
const ART_ANY: Ref[] = (
  [
    { id: "art_any_common", name: "Любой обычный артефакт" },
    { id: "art_any_rare", name: "Любой редкий артефакт" },
    { id: "art_any_epic", name: "Любой эпический артефакт" },
    { id: "art_any_legendary", name: "Любой легендарный артефакт" },
  ] as const
).map((r) => ({ id: r.id, name: r.name, image: artAnyIconSrc(r.id), rarity: artAnyRarity(r.id) }));

/**
 * @param noArtAny — убрать «любой арт редкости X». Нужно там, где игрок не
 * сможет выбрать, ЧЕМ именно расплатится: пикер артефакта на витрине покрывает
 * только первую цену, и «любой арт» второй ценой снова стал бы лотереей —
 * магазин молча забрал бы самый старый свободный.
 */
export async function fetchRefs(kind: MarketKind, noArtAny = false): Promise<Ref[]> {
  if (kind === "hero") return (await adminListItems({ data: { kind: "hero" } })).map(norm);
  if (kind === "art") {
    // Псевдо-шаблоны «по редкости» — первыми пунктами: часто нужнее, чем
    // конкретный артефакт (см. server/beta-raid/art-rarity.resolveArtByRarity).
    const items = (await adminListItems({ data: { kind: "artifact" } })).map(norm);
    return noArtAny ? items : [...ART_ANY, ...items];
  }
  if (kind === "boss") return (await adminListBossTemplates()).templates.map(norm);
  if (kind === "pack") return (await adminListChipPacks()).map(norm);
  if (kind === "custom") return (await listCustomItems()).map(norm);
  return [];
}
