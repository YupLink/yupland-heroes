import { lazy, Suspense, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { getSession } from "@/server/api/user-auth";
import { isWalletLinked } from "@/lib/walletLinked";
import { RaidEnergyPanel } from "./RaidEnergyPanel";
const EnergyBuyDialog = lazy(() => import("@/components/castle-live/energy-buy/EnergyBuyDialog").then(m => ({ default: m.EnergyBuyDialog })));
// Билетов нет (ПРАВИЛА §8.61) — окна докупки билетов из покупки энергии больше нет.
export function RaidEnergyHud({ ru }: { ru: boolean }) {
  const energy = useEnergy();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const [buy, setBuy] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const returnFocus = () => host.current?.querySelector<HTMLButtonElement>(".raid-energy__buy")?.focus();
  const linked = isWalletLinked(session.data?.wallet);
  const close = () => { setBuy(false); requestAnimationFrame(returnFocus); };
  return <div ref={host}>
    <RaidEnergyPanel ru={ru} data={energy.data} updatedAt={energy.dataUpdatedAt} pending={energy.isPending} error={energy.isError} onRetry={() => void energy.refetch()} onBuy={() => setBuy(true)} />
    <Suspense fallback={null}>
      {buy && <EnergyBuyDialog open ru={ru} walletView={linked} onClose={close} returnFocus={returnFocus} />}
    </Suspense>
  </div>;
}
