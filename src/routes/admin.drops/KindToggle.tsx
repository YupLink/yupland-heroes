import { Coins, ImageIcon, Package, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function KindToggle({
  value,
  onChange,
}: {
  value: "ft" | "nft" | "pack" | "energy";
  onChange: (v: "ft" | "nft" | "pack" | "energy") => void;
}) {
  const opts: Array<{ key: "ft" | "nft" | "pack" | "energy"; label: string; icon: typeof Coins }> = [
    { key: "ft", label: "Токены", icon: Coins },
    { key: "nft", label: "NFT", icon: ImageIcon },
    { key: "pack", label: "Лут-бокс", icon: Package },
    { key: "energy", label: "Энергия", icon: Zap },
  ];
  return (
    <div className="inline-flex h-8 select-none items-center rounded-full border border-border bg-secondary/60 p-0.5 text-[11px] font-medium">
      {opts.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={cn(
              "inline-flex h-full items-center gap-1 rounded-full px-3 transition-colors",
              value === o.key ? "gradient-gold text-gold-foreground shadow-gold" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
