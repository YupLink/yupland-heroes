import { lazy, Suspense, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { getSession } from "@/server/api/user-auth";
import { isWalletLinked } from "@/lib/walletLinked";
import { RaidEnergyPanel } from "./RaidEnergyPanel";
const EnergyBuyDialog = lazy(() => import("@/components/castle-live/energy-buy/EnergyBuyDialog").then(m => ({ default: m.EnergyBuyDialog })));
const TicketPurchaseLive = lazy(() => import("@/components/chips/trading-house/TicketPurchaseLive").then(m => ({ default: m.TicketPurchaseLive })));
export function RaidEnergyHud({ ru }: { ru: boolean }) {
  const energy = useEnergy();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const [buy, setBuy] = useState<"energy" | "tickets" | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const returnFocus = () => host.current?.querySelector<HTMLButtonElement>(".raid-energy__buy")?.focus();
  const linked = isWalletLinked(session.data?.wallet);
  const close = () => { setBuy(null); requestAnimationFrame(returnFocus); };
  return <div ref={host}>
    <RaidEnergyPanel ru={ru} data={energy.data} updatedAt={energy.dataUpdatedAt} pending={energy.isPending} error={energy.isError} onRetry={() => void energy.refetch()} onBuy={() => setBuy("energy")} />
    <Suspense fallback={null}>
      {buy === "energy" && <EnergyBuyDialog open ru={ru} walletView={linked} onClose={close} returnFocus={returnFocus} onNeedTickets={() => setBuy("tickets")} />}
      {buy === "tickets" && <TicketPurchaseLive open walletConnected={linked} accountOpen={session.data?.accountOpen === true} onClose={() => setBuy("energy")} returnFocus={returnFocus} />}
    </Suspense>
  </div>;
}
