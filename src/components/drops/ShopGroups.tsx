import { useEffect, useState } from "react";
import { Coins, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { shortAmount, type ShopOffer, type EnergyMut, type TokenMut } from "./shop-shared";
import { OfferCard } from "./OfferCard";
import { useAccountBalance, useAccountEnabled } from "@/lib/hooks/useAccountBalances";

export function ShopGroups({
  offers,
  linked,
  energyBalance,
  tokenBalances,
  onUnlinkEnergy,
  purchaseEnergyMut,
  purchaseTokenMut,
}: {
  offers: ShopOffer[];
  linked: boolean;
  energyBalance: number | null;
  tokenBalances: Record<
    string,
    { totalHuman: string; totalRaw: string; decimals: number }
  >;
  onUnlinkEnergy: () => void;
  purchaseEnergyMut: EnergyMut;
  purchaseTokenMut: TokenMut;
}) {
  const t = useT();
  type GroupKey = string;
  const groups = new Map<GroupKey, ShopOffer[]>();
  for (const o of offers) {
    // Тариф в $ платится со счёта в окне «Купить билеты» (Торговый дом) —
    // здесь его нечем оплатить, а без цены в энергии он выглядел бы бесплатным.
    if (o.priceUsd != null) continue;
    const key = o.paymentToken ?? "energy";
    const arr = groups.get(key) ?? [];
    arr.push(o);
    groups.set(key, arr);
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.tickets - b.tickets);
  }
  const tabs = Array.from(groups.keys());
  tabs.sort((a, b) =>
    a === "energy" ? -1 : b === "energy" ? 1 : a.localeCompare(b)
  );

  const [activeTab, setActiveTab] = useState<GroupKey>(tabs[0] ?? "energy");
  useEffect(() => {
    if (!tabs.includes(activeTab) && tabs[0]) setActiveTab(tabs[0]);
  }, [tabs, activeTab]);

  const activeOffers = groups.get(activeTab) ?? [];
  const basePerTicket =
    activeOffers.length > 0
      ? activeOffers
          .map((o) =>
            o.paymentToken
              ? (o.effectivePriceToken ?? o.priceToken ?? 0) /
                Math.max(1, o.tickets)
              : (o.effectivePriceEnergy ?? o.priceEnergy) /
                Math.max(1, o.tickets)
          )
          .sort((a, b) => b - a)[0]
      : 0;

  const isEnergyTab = activeTab === "energy";
  // Со счётом наверху должно стоять то число, которым платит кнопка. Иначе
  // «720,8 млн на кошельке» соседствует с отказом «не хватает» — и это
  // читается как поломка, а не как пустой счёт.
  const accountOn = useAccountEnabled();
  const accountBalance = useAccountBalance(isEnergyTab ? null : activeTab);
  const tokenBalanceNumber =
    isEnergyTab
      ? null
      : accountOn && accountBalance != null
        ? accountBalance
        : Number.parseFloat(tokenBalances[activeTab]?.totalHuman ?? "0");
  const activeBalanceLabel = isEnergyTab
    ? energyBalance == null
      ? "—"
      : shortAmount(energyBalance)
    : tokenBalanceNumber != null && Number.isFinite(tokenBalanceNumber)
      ? shortAmount(tokenBalanceNumber)
      : (tokenBalances[activeTab]?.totalHuman ?? "0");

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm",
          isEnergyTab
            ? "border-gold/30 bg-gold/5"
            : "border-neon/30 bg-neon/5"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {isEnergyTab ? (
            <Zap className="h-4 w-4 shrink-0 text-gold" />
          ) : (
            <Coins className="h-4 w-4 shrink-0 text-neon" />
          )}
          <span className="text-muted-foreground">
            {isEnergyTab
              ? `${t("mynfts.energy_label")}:`
              : accountOn
                ? `${activeTab} на счету:`
                : `${activeTab}:`}
          </span>
          <span
            className={cn(
              "min-w-0 truncate font-mono font-medium",
              isEnergyTab ? "text-foreground" : "text-neon"
            )}
          >
            {activeBalanceLabel} {isEnergyTab ? "" : activeTab}
          </span>
        </div>
        {isEnergyTab && linked && (
          <button
            onClick={onUnlinkEnergy}
            className="text-[11px] text-muted-foreground underline transition hover:text-foreground"
          >
            {t("mynfts.unlink")}
          </button>
        )}
      </div>

      {tabs.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {tabs.map((tab) => {
            const count = groups.get(tab)?.length ?? 0;
            const isEnergy = tab === "energy";
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? isEnergy
                      ? "border-gold/40 bg-gold/10 text-gold"
                      : "border-neon/40 bg-neon/10 text-neon"
                    : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground"
                )}
              >
                {isEnergy ? (
                  <Zap className="h-3.5 w-3.5" />
                ) : (
                  <Coins className="h-3.5 w-3.5" />
                )}
                {isEnergy ? t("mynfts.energy_label") : tab}
                <span className="text-[10px] opacity-70">·{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        {activeOffers.map((o) => (
          <OfferCard
            key={o.id}
            o={o}
            linked={linked}
            energyBalance={energyBalance}
            basePerTicket={basePerTicket}
            purchaseEnergyMut={purchaseEnergyMut}
            purchaseTokenMut={purchaseTokenMut}
          />
        ))}
      </div>
    </div>
  );
}
