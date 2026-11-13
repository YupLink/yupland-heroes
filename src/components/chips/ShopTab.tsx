import { usePurchaseMusic } from "@/hooks/usePurchaseMusic";
import { TicketBalance } from "./TicketBalance";
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { listChipPacksPublic, reconcileMyDaraiPacks } from "@/server/api/chips-pack";
import { getMyDaraiBalance } from "@/server/api/chips-craft";
import { useResources } from "@/lib/hooks/useResources";
import { PendingPackPurchaseBanner } from "./PendingPackPurchaseBanner";
import { RecoverPackPurchase } from "./RecoverPackPurchase";
import { ChipPackCard } from "./ChipPackCard";
import { TradingHouseLive } from "./trading-house/TradingHouseLive";

export function ShopTab({
  mode,
  onClose,
  onOpenPacks,
  onOpenMarket,
  initialPage,
  onPageChange,
}: { mode?: "castle" | "camp"; onClose?: () => void; onOpenPacks?: () => void; onOpenMarket?: () => void; initialPage?: "packs" | "artifacts"; onPageChange?: (page: "packs" | "artifacts") => void } = {}) {
  if (mode === "castle" || mode === "camp")
    return (
      <TradingHouseLive
        presentation={mode === "camp" ? "camp" : "house"}
        onClose={onClose ?? (() => {})}
        onOpenPacks={onOpenPacks ?? onClose ?? (() => {})}
        onOpenMarket={onOpenMarket}
        initialPage={initialPage}
        onPageChange={onPageChange}
      />
    );
  return (
    <div className="space-y-3">
      <TicketBalance />
      <ShopTabContent />
    </div>
  );
}
function ShopTabContent() {
  usePurchaseMusic(true);
  const t = useT();
  const packs = useQuery({
    queryKey: ["chip-packs-public"],
    queryFn: () => listChipPacksPublic(),
  });
  const resources = useResources();
  const darai = useQuery({
    queryKey: ["my-darai-balance"],
    queryFn: () => getMyDaraiBalance(),
  });
  const available = resources.data?.gold ?? 0;
  const availableDarai = darai.data?.available ?? 0;

  const qcShop = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    reconcileMyDaraiPacks()
      .then((r) => {
        if (cancelled || !r?.recovered) return;
        toast.success(t("chips.pack_auto_recovered", { n: r.recovered }));
        qcShop.invalidateQueries({ queryKey: ["my-chip-packs"] });
        qcShop.invalidateQueries({ queryKey: ["chip-packs-public"] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (packs.isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const rows = packs.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
          {t("chips.no_packs_on_sale")}{" "}
          <Link to="/admin/chips" className="text-gold underline">
            /admin/chips
          </Link>
          .
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3 pt-2">
      <PendingPackPurchaseBanner />
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("chips.pack_shop", { n: rows.length })}
      </div>
      {rows.map((p) => (
        <ChipPackCard
          key={p.id}
          pack={p}
          availableGold={available}
          availableDarai={availableDarai}
        />
      ))}
      <RecoverPackPurchase packs={rows} />
    </div>
  );
}


