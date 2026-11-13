import { usePurchaseMusic } from "@/hooks/usePurchaseMusic";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Zap, X } from "lucide-react";
import { getMyDaraiBalance } from "@/server/api/chips-craft";
import { KitsSection } from "@/components/kits/KitsSection";
import { AdminEnergyGrantCard } from "./AdminEnergyGrantCard";
import { AdminGiftEnergyCard } from "./AdminGiftEnergyCard";
import { AdminResetEnergyLimitsCard } from "./AdminResetEnergyLimitsCard";
import { EnergyLikeOfferCard } from "./EnergyLikeOfferCard";
import { EnergyPacksSection } from "./EnergyPacksSection";
import { EnergySubSection } from "./EnergySubSection";
import { RecoverEnergyPurchase } from "./RecoverEnergyPurchase";
import { useResources } from "@/lib/hooks/useResources";

export function EnergyBuyModal({ onClose }: { onClose: () => void }) {
  usePurchaseMusic(true);
  // Игровая цена энергопака — золото (бывшие билеты ×500, §8.61).
  const resources = useResources();
  const darai = useQuery({
    queryKey: ["my-darai-balance"],
    queryFn: () => getMyDaraiBalance(),
  });
  const availableGold = resources.data?.gold ?? 0;
  const availableDarai = darai.data?.available ?? 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col bg-background/95 backdrop-blur">
      <div className="flex items-center gap-2 border-b border-border px-4 pb-3 pt-[calc(12px+var(--app-top,0px))]">
        <Zap className="h-5 w-5 text-rose-400" />
        <span className="font-display text-lg font-bold">Купить энергию</span>
        <button
          onClick={onClose}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-sm font-semibold text-muted-foreground transition active:scale-95"
        >
          <X className="h-4 w-4" /> Закрыть
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-24">
        <AdminEnergyGrantCard />
        <AdminGiftEnergyCard />
        <AdminResetEnergyLimitsCard />
        <KitsSection />
        <EnergySubSection />
        <EnergyLikeOfferCard />
        <EnergyPacksSection availableGold={availableGold} availableDarai={availableDarai} />
        <div className="mt-3 text-center text-xs text-muted-foreground">
          Энергия начислится сразу после подтверждения оплаты.
        </div>
        <RecoverEnergyPurchase />
      </div>
    </div>,
    document.body,
  );
}

