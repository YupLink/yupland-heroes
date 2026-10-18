// Цена тарифа в $ + подсказка: сколько это сейчас в USDT, DARAI и звёздах
// (DARAI −10 %, звёзды +10 % — как у подписки, lib/usdTariff.ts).
import { useQuery } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { adminUsdRate } from "@/server/api/usd-rate";
import { usdPrices } from "@/lib/usdTariff";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export function UsdPreview({ usd, className }: { usd: number; className?: string }) {
  const rate = useQuery({ queryKey: ["admin", "usd-rate"], queryFn: () => adminUsdRate(), staleTime: 60_000 });
  if (!(usd > 0)) return null;
  const p = usdPrices(usd, rate.data?.daraiPerUsd ?? null);
  return (
    <p className={cn("text-[11px] text-muted-foreground", className)}>
      Сейчас: {fmt(p.USDT ?? 0)} USDT · {p.Darai != null ? `${fmt(p.Darai)} DARAI` : "DARAI — нет курса"} ·{" "}
      {fmt(p.STARS ?? 0)} ★ — меняется с курсом DARAI
    </p>
  );
}

export function UsdPriceField({
  value,
  onChange,
  size = "md",
}: {
  value: string;
  onChange: (v: string) => void;
  size?: "sm" | "md";
}) {
  const sm = size === "sm";
  return (
    <div className={sm ? "w-28" : undefined}>
      <label
        className={cn(
          "mb-1 flex items-center gap-1 uppercase tracking-wider text-emerald-300/80",
          sm ? "text-[10px]" : "mb-1.5 text-xs font-medium",
        )}
      >
        <DollarSign className={sm ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Цена в $
      </label>
      <input
        type="number"
        min={0.01}
        step={0.01}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="напр. 20"
        className={cn(
          "w-full border border-emerald-400/40 bg-emerald-500/5 outline-none focus:border-emerald-400/70",
          sm ? "rounded-lg px-2 py-1.5 text-sm" : "rounded-xl px-3 py-2.5 text-sm",
        )}
      />
    </div>
  );
}
