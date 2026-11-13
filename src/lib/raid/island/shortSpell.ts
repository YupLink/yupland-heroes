// A tutorial copies an existing configured pillar; it does not invent a price or spell.
import type { PortalPrice } from "@/lib/portal";

export type ShortSpellPillar = {
  buildingId: string;
  buildingSkinId: string | null;
  tier: number;
  spellbook: { learnPrices: PortalPrice[]; forgetPrices: PortalPrice[]; spells: string[] };
};

/** Only ordinary game resources can be included in the one-time starter chest. */
export const canFundPillar = (prices: readonly PortalPrice[]) => prices.length > 0 && prices.every(
  (p) => ["gold", "wood", "stone", "diamonds", "likes", "energy"].includes(p.resource)
    && Number.isFinite(p.amount) && p.amount > 0,
);

export const islandSpellReceiptTail = (mapId: string, q: number, r: number) =>
  `:island:${mapId}:${q}:${r}:paid`;
