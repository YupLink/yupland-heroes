import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { onChipsSub, takePendingChipsSub, type ChipsSubTab } from "@/lib/chipsNav";
import { cn } from "@/lib/utils";
import { Sparkles, Layers, Package, FolderHeart } from "lucide-react";
import { MyInventoryTab } from "./MyInventoryTab";
import { MyPacksTab } from "./MyPacksTab";
import { CollectionsTab } from "./CollectionsTab";
import { MysticInventory } from "@/components/MysticInventory";

export function ChipsTab({ isAdmin, giftPack, onExitGiftPack }: { isAdmin?: boolean; giftPack?: { giftId: string; packId: string } | null; onExitGiftPack?: () => void }) {
  const t = useT();
  const [sub, setSub] = useState<ChipsSubTab>("inventory");
  // Переход «покажи, где лежит выданное» из модалки ввода NFT: она живёт в
  // шапке страницы и до этого стейта не дотягивается. Отложенную цель
  // забираем при монтировании — вкладка «Фишки» могла быть ещё не открыта.
  useEffect(() => {
    const pending = takePendingChipsSub();
    if (pending) setSub(pending);
    return onChipsSub((s) => {
      takePendingChipsSub();
      if (s !== "packs") onExitGiftPack?.();
      setSub(s);
    });
  }, [onExitGiftPack]);
  const opts: Array<{ key: ChipsSubTab; label: string; icon: typeof Sparkles }> = [
    { key: "inventory", label: t("chips.brand_chips"), icon: Layers },
    { key: "packs", label: t("chips.sub_packs"), icon: Package },
    { key: "collections", label: t("chips.sub_collections"), icon: FolderHeart },
    { key: "items" as const, label: t("chips.sub_items"), icon: Sparkles },
  ];
  return (
    <div className="space-y-3 pt-2">
      <div className="flex w-full select-none items-center rounded-full border border-border bg-secondary/40 p-1 text-xs">
        {opts.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => { if (o.key !== "packs") onExitGiftPack?.(); setSub(o.key); }}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2 py-2 transition sm:gap-1.5 sm:px-3",
                sub === o.key
                  ? "gradient-gold text-gold-foreground shadow-gold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 flex-none" />
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
      {sub === "inventory" && <MyInventoryTab />}
      {sub === "packs" && <MyPacksTab giftPack={giftPack} />}
      {sub === "collections" && <CollectionsTab />}
      {sub === "items" && <MysticInventory />}
    </div>
  );
}
