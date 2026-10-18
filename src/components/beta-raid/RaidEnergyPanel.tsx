import { Plus } from "lucide-react";
import { EnergyRecoveryCountdown } from "@/components/castle-live/EnergyRecoveryCountdown";
import "./raid-hud-layout.css";

export function RaidEnergyPanel({ ru, data, updatedAt, pending, error, onBuy, onRetry }: {
  ru: boolean; data?: { energy: number; maxEnergy: number; nextRegenSec: number };
  updatedAt: number; pending?: boolean; error?: boolean; onBuy: () => void; onRetry?: () => void;
}) {
  const fmt = new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 0 });
  const compact = (n: number) => n >= 1_000 ? `${Math.floor(n / (n >= 1_000_000 ? 1_000_000 : 1_000) * 10) / 10}${n >= 1_000_000 ? "M" : "K"}` : fmt.format(n);
  const full = data ? `${fmt.format(Math.floor(data.energy))}/${fmt.format(data.maxEnergy)}` : undefined;
  const value = data && full && full.length > 7 ? `${compact(Math.floor(data.energy))}/${compact(data.maxEnergy)}` : full;
  return <section className="raid-energy" aria-label={ru ? "Энергия" : "Energy"}>
    <img src="/resources/energy.webp" alt="" />
    <div className="raid-energy__value">
      <strong title={full} aria-label={full}>{value ?? (pending ? "…" : "—")}</strong>
      {data && <EnergyRecoveryCountdown ru={ru} {...data} updatedAt={updatedAt} />}
      {error && <button type="button" className="raid-energy__retry" onClick={onRetry}>{ru ? "Повторить" : "Retry"}</button>}
    </div>
    <button type="button" className="raid-energy__buy" aria-label={ru ? "Купить энергию" : "Buy energy"} onClick={onBuy}><Plus aria-hidden="true" /></button>
  </section>;
}
