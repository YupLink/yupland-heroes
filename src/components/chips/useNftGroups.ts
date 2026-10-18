import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { MAX_NFT_BATCH, keyOf, displayOf, type DepositableNft } from "./nft-input-shared";

export type NftGroup = {
  key: string;
  sample: DepositableNft;
  mainTitle: string;
  subtitle: string;
  tokens: DepositableNft[];
  keys: string[];
};

export function useNftGroups(items: DepositableNft[]) {
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qtyByGroup, setQtyByGroup] = useState<Record<string, number>>({});

  const groups = useMemo(() => {
    const map = new Map<string, NftGroup>();
    for (const nft of items) {
      const { mainTitle, subtitle } = displayOf(nft, t);
      const gk = `${nft.rewardType}|${nft.contract}|${mainTitle}|${subtitle}`;
      let g = map.get(gk);
      if (!g) {
        g = { key: gk, sample: nft, mainTitle, subtitle, tokens: [], keys: [] };
        map.set(gk, g);
      }
      g.tokens.push(nft);
      if (nft.rewardType === "chip" || nft.rewardType === "pack") g.keys.push(keyOf(nft));
    }
    return [...map.values()];
  }, [items, t]);

  const batchableItems = items.filter((i) => i.rewardType === "chip" || i.rewardType === "pack");
  const cappedTotal = Math.min(batchableItems.length, MAX_NFT_BATCH);
  const allSelected = selected.size > 0 && selected.size >= cappedTotal;
  const selectedKeys = Array.from(selected);
  const selectedItems = batchableItems.filter((i) => selected.has(`${i.contract}:${i.tokenId}`));

  const addUpToCap = (base: Set<string>, keys: string[]) => {
    const n = new Set(base);
    for (const k of keys) {
      if (n.size >= MAX_NFT_BATCH) break;
      n.add(k);
    }
    return n;
  };

  const qtyOf = (g: NftGroup) => {
    const max = Math.min(g.tokens.length, MAX_NFT_BATCH);
    const v = qtyByGroup[g.key];
    return v == null ? max : Math.max(1, Math.min(v, max));
  };

  const setQty = (g: NftGroup, n: number) => {
    const max = Math.min(g.tokens.length, MAX_NFT_BATCH);
    const val = Math.max(1, Math.min(n, max));
    setQtyByGroup((m) => ({ ...m, [g.key]: val }));
    setSelected((s) => {
      if (!g.keys.some((k) => s.has(k))) return s;
      const n2 = new Set(s);
      g.keys.forEach((k) => n2.delete(k));
      return addUpToCap(n2, g.keys.slice(0, val));
    });
  };

  function toggleGroup(g: NftGroup) {
    const keys = g.keys.slice(0, qtyOf(g));
    setSelected((s) => {
      const allIn = keys.length > 0 && keys.every((k) => s.has(k));
      if (allIn) {
        const n = new Set(s);
        keys.forEach((k) => n.delete(k));
        return n;
      }
      const n = addUpToCap(s, keys);
      if (n.size >= MAX_NFT_BATCH && keys.some((k) => !n.has(k)))
        toast.message(`Максимум ${MAX_NFT_BATCH} NFT за раз`);
      return n;
    });
  }

  function selectAll() {
    const all = batchableItems.map(keyOf);
    if (all.length > MAX_NFT_BATCH) toast.message(`Выбрано ${MAX_NFT_BATCH} — максимум за раз`);
    setSelected(addUpToCap(new Set(), all));
  }

  function clearAll() {
    setSelected(new Set());
  }

  return {
    groups,
    selected,
    selectedKeys,
    selectedItems,
    batchableItems,
    cappedTotal,
    allSelected,
    qtyOf,
    setQty,
    toggleGroup,
    selectAll,
    clearAll,
  };
}
