// Каталог всего, что можно назначить ратуше: свои товары (с категорией),
// бойцы, паки, артефакты, герои и ресурсы. Те же запросы и ключи, что у пикера
// товара (MarketRefPicker): открытый ранее список второй раз в базу не пойдёт.
import { useQueries, useQuery } from "@tanstack/react-query";
import { fetchRefs } from "../market/refPickerSources";
import { listItemCategories } from "@/server/api/beta-raid/item-categories";
import { allCategories, categoryIdOf, type ItemCategory } from "@/lib/itemCategories";
import { MARKET_RESOURCE_GOODS, RESOURCE_LABELS_RU, type MarketKind } from "@/lib/marketItem";
import { marketResourceIconSrc } from "@/lib/resourceIcons";

export type TownRef = {
  /** `${kind}:${refId}` — по нему товар ратуши находит свою подпись. */
  key: string;
  kind: MarketKind;
  refId: string;
  name: string;
  image: string | null;
  /** Категория своего товара из справочника (у прочих — null). */
  categoryId: string | null;
  /** Категория для группировки: своя, «без категории» или по виду. */
  catId: string;
};

const TEMPLATE_KINDS = ["custom", "boss", "pack", "art", "hero"] as const;

export const townRefKey = (kind: MarketKind, refId: string | null) => `${kind}:${refId ?? ""}`;

/** Ресурсы-товары: золото — валюта города, токену нужен символ (правится в строке). */
const RESOURCES = MARKET_RESOURCE_GOODS.filter((r) => r !== "gold" && r !== "token");

export function useTownRefs(enabled = true) {
  const lists = useQueries({
    queries: TEMPLATE_KINDS.map((kind) => ({
      // «Любой арт редкости» ратуше не годится: склад держит конкретный товар.
      queryKey: ["market-ref", kind, "no-any"],
      queryFn: () => fetchRefs(kind, true),
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 3,
      enabled,
    })),
  });
  const catsQ = useQuery({
    queryKey: ["item-categories"],
    queryFn: () => listItemCategories(),
    staleTime: 60_000,
    enabled,
  });

  const refs: TownRef[] = RESOURCES.map((code) => ({
    key: townRefKey("resource", code),
    kind: "resource" as MarketKind,
    refId: code,
    name: RESOURCE_LABELS_RU[code],
    image: marketResourceIconSrc(code),
    categoryId: null,
    catId: categoryIdOf("resource", null),
  }));
  TEMPLATE_KINDS.forEach((kind, i) => {
    for (const r of lists[i].data ?? []) {
      refs.push({
        key: townRefKey(kind, r.id),
        kind,
        refId: r.id,
        name: r.name,
        image: r.image,
        categoryId: r.categoryId ?? null,
        catId: categoryIdOf(kind, r.categoryId),
      });
    }
  });
  const cats: ItemCategory[] = allCategories(catsQ.data ?? []);
  return {
    refs,
    byKey: new Map(refs.map((r) => [r.key, r])),
    cats,
    customCats: catsQ.data ?? [],
    loading: catsQ.isLoading || lists.some((l) => l.isLoading),
    failed: catsQ.isError || lists.some((l) => l.isError),
  };
}
