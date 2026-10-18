import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { getHeroSpellbook, getOwnedHeroSpellbook } from "@/server/api/beta-raid/spell-book";
import { bagLayout } from "../backpackCellList";
import type { Castle } from "./useCastle";

export type ContainerPreview = { count: number; image?: string | null; name?: string; loaded: boolean; error?: boolean };
export type GearContainers = Record<"backpack" | "potions" | "spells", ContainerPreview>;

/** Read existing, hero-scoped data; never infer contents from a decorative icon. */
export function useGearContainerPreview(castle: Castle, enabled = true): GearContainers {
  const wallet = useAppStore(s => s.walletAddress);
  const heroId = castle.viewedHeroId;
  const book = useQuery({
    queryKey: heroId ? ["hero-spellbook", "view", wallet, heroId] : ["hero-spellbook"],
    queryFn: () => heroId ? getOwnedHeroSpellbook({ data: { heroId } }) : getHeroSpellbook(),
    enabled,
    ...(heroId ? { staleTime: 30_000, gcTime: 0 } : {}),
  });
  const bag = (castle.backpack.isSuccess ? castle.backpack.data : undefined) as (NonNullable<Castle["backpack"]["data"]> & { potionCapacity?: number }) | undefined;
  const known = !!bag && Number.isFinite(bag.potionCapacity) && bag.stacks.every(s => typeof (s as typeof s & { potion?: boolean }).potion === "boolean");
  const layout = known ? bagLayout(bag!.stacks, bag!.capacity, bag!.potionCapacity!) : null;
  const summarize = (cells: NonNullable<typeof layout>["backpack"] | undefined): ContainerPreview => {
    const occupied = cells?.filter(c => c && c.units > 0) ?? [];
    const first = occupied.find(c => c?.image) ?? occupied[0];
    return { count: occupied.length, image: first?.image, name: first?.name, loaded: !!layout, error: castle.backpack.isError };
  };
  const spells = book.isSuccess ? book.data?.spells ?? [] : [];
  const firstSpell = spells.find(s => s.image) ?? spells[0];
  return {
    backpack: summarize(layout?.backpack),
    potions: summarize(layout?.potions),
    spells: { count: spells.length, image: firstSpell?.image, name: firstSpell?.name, loaded: book.isSuccess, error: book.isError },
  };
}
