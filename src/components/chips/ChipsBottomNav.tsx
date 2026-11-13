import { useQuery } from "@tanstack/react-query";
import { Home, ShoppingCart, Layers, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { myChipInventory } from "@/server/api/chips-pack";

// Маркет фишек снова открыт 21.10.2026 — за золото.
type Tab = "home" | "chips" | "shop" | "market" | "pvp" | "boss" | "raid" | "beta-raid";

export function ChipsBottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const t = useT();
  const inv = useQuery({
    queryKey: ["my-chip-inventory"],
    queryFn: () => myChipInventory(),
  });
  const chipCount = (inv.data ?? []).reduce((s, r) => s + r.count, 0);

  const items: Array<{
    key: Tab;
    label: string;
    icon: typeof Home;
    badge?: string;
    soon?: boolean;
  }> = [
    { key: "home", label: t("chips.nav_home"), icon: Home },
    {
      key: "chips",
      label: chipCount > 0 ? String(chipCount) : t("chips.brand_chips"),
      icon: Layers,
      badge: chipCount > 0 ? "" : undefined,
    },
    { key: "shop", label: t("chips.nav_shop"), icon: Store },
    { key: "market", label: t("chips.nav_market"), icon: ShoppingCart },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto grid max-w-3xl grid-cols-4">
        {items.map((it) => {
          const Icon = it.icon;
          const active = tab === it.key;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => setTab(it.key)}
              className={cn(
                "relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] transition",
                active ? "text-gold" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition",
                  active && "drop-shadow-[0_0_8px_var(--color-gold)]",
                )}
              />
              <span className="font-medium truncate max-w-full px-1">{it.label}</span>
              {it.soon && (
                <span className="absolute right-1 top-1 rounded-full bg-amber-400/30 px-1 text-[7px] font-bold uppercase text-amber-400">
                  soon
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
