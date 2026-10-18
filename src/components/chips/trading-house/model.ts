export type HouseProduct = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  kind: string;
  priceTickets: number | null;
  priceDarai: number | null;
  priceStars?: number | null;
  soldCount: number;
  totalSupply: number | null;
  dailyLimit: number;
  dailyUsedToday: number;
  startsAt: string | null;
  endsAt: string | null;
  dropTable: unknown;
  /** Artwork key is only used by the isolated design preview. */
  art?: "yupik" | "market" | "magical" | "viking";
};

export type HouseContents = {
  slots: number;
  entries: Array<{ key: string; label: string; chance: number }>;
  guarantees: Array<{ minLevel: number; slotsAtLeast: number }>;
};

type Drop = {
  collectionId?: string | null;
  templateId?: string | null;
  level: number;
  weight: number;
};
type Table = {
  slots?: number;
  dropTable?: Drop[];
  guarantees?: Array<{ minLevel: number; slotsAtLeast: number }>;
};

export function maxHouseQuantity(
  pack: HouseProduct,
  method: "tickets" | "darai" | "stars",
  now = Date.now(),
): number {
  if (pack.startsAt && Date.parse(pack.startsAt) > now) return 0;
  if (pack.endsAt && Date.parse(pack.endsAt) <= now) return 0;
  const price =
    method === "tickets"
      ? pack.priceTickets
      : method === "stars"
        ? pack.priceStars
        : pack.priceDarai;
  if (price == null || !Number.isFinite(price) || price < 0) return 0;
  const stock = pack.totalSupply == null ? 50 : Math.max(0, pack.totalSupply - pack.soldCount);
  // Серверный дневной лимит относится только к оплате билетами.
  const daily =
    method === "tickets" && pack.dailyLimit > 0
      ? Math.max(0, pack.dailyLimit - pack.dailyUsedToday)
      : 50;
  return Math.min(50, stock, daily);
}

/** Use only validated public data. Template-specific names require a detail response. */
export function houseContents(
  pack: HouseProduct,
  names: Map<string, string>,
): HouseContents | null {
  if (pack.kind === "mystic") return null;
  const table = pack.dropTable as Table | null;
  if (
    !table ||
    !Number.isInteger(table.slots) ||
    !table.slots ||
    table.slots < 1 ||
    !Array.isArray(table.dropTable)
  )
    return null;
  const drops = table.dropTable;
  if (
    !drops.length ||
    drops.some(
      (item) =>
        item.templateId ||
        !item.collectionId ||
        !names.has(item.collectionId) ||
        !Number.isFinite(item.level) ||
        !Number.isFinite(item.weight) ||
        item.weight <= 0,
    )
  )
    return null;
  const total = drops.reduce((sum, item) => sum + item.weight, 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  const grouped = new Map<string, { label: string; weight: number }>();
  for (const item of drops) {
    const key = `${item.collectionId}:${item.level}`;
    grouped.set(key, {
      label: `${names.get(item.collectionId!)} · ${item.level}★`,
      weight: (grouped.get(key)?.weight ?? 0) + item.weight,
    });
  }
  const guarantees = table.guarantees ?? [];
  if (
    !Array.isArray(guarantees) ||
    guarantees.some(
      (item) =>
        !Number.isFinite(item.minLevel) ||
        !Number.isInteger(item.slotsAtLeast) ||
        item.slotsAtLeast < 1 ||
        item.slotsAtLeast > table.slots!,
    )
  )
    return null;
  return {
    slots: table.slots,
    entries: [...grouped].map(([key, item]) => ({
      key,
      label: item.label,
      chance: (item.weight / total) * 100,
    })),
    guarantees,
  };
}
