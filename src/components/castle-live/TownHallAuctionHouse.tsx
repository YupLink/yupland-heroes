import {useTownHallPurchaseSuccess} from './TownHallPurchaseSuccess';
// Ратуша замка → «Аукционный дом» (владелец, 14.10.2026): постройка и улучшение
// до 10-го уровня ресурсами. Облик здания на площади замка меняется с каждым
// уровнем (modularAuctionHouse): здесь — нынешний и следующий. Комиссия
// проекту с продажи — нынешняя → после улучшения. Правила — lib/auctionHouse.ts.
// Торговля (выставить лот) — в окне аукционов.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { ArrowRight, Hammer, Loader2 } from "lucide-react";
import { getAuctionHouse, upgradeAuctionHouse } from "@/server/api/game-auction";
import type { HouseCost } from "@/lib/auctionHouse";
import { HOUSE_KEY, refreshAuctionData } from "@/components/chips/auctions/auctionRefresh";
import { auctionHouseLook } from "./modularAuctionHouse";

const RES: Array<{ key: keyof HouseCost; icon: string }> = [
  { key: "wood", icon: "/resources/wood.webp" },
  { key: "stone", icon: "/resources/stone.webp" },
  { key: "gold", icon: "/resources/gold.webp" },
  { key: "diamonds", icon: "/resources/crystal.webp" },
];

export function TownHallAuctionHouse({ ru }: { ru: boolean }) {
 const purchaseSuccess=useTownHallPurchaseSuccess();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: HOUSE_KEY, queryFn: () => getAuctionHouse() });
  const h = q.data;
  const up = useMutation({
    mutationFn: () =>
      upgradeAuctionHouse({ data: { fromLevel: h?.level ?? 0, opId: crypto.randomUUID() } }),
    onSuccess: (r) => {
      if(r.level===1)purchaseSuccess({kind:'building',id:'auction'});
      toast.success(
        r.level === 1
          ? ru
            ? "Аукционный дом построен"
            : "Auction house built"
          : ru
            ? `Аукционный дом — уровень ${r.level}`
            : `Auction house — level ${r.level}`,
      );
      refreshAuctionData(qc);
    },
    onError: (e: unknown) => {
      // Отказ ключом (нет места в лимите Ратуши, §8.64) — словом; фраза — как есть.
      toast.error(humanError(e));
      refreshAuctionData(qc);
    },
  });

  if (!h) {
    return (
      <section className="town-hall-build town-hall-build--loading">
        <Loader2 className="town-hall-build__spin animate-spin" aria-hidden="true" />
      </section>
    );
  }
  const built = h.level > 0;
  const cost = h.cost;
  const short = (k: keyof HouseCost) => !!cost && (h.resources[k] ?? 0) < cost[k];
  const fee = built
    ? `${h.feePct}%${h.nextFeePct != null ? ` → ${h.nextFeePct}%` : ""}`
    : `${h.nextFeePct}%`;

  return (
    <section className="town-hall-build" aria-label={ru ? "Аукционный дом" : "Auction house"}>
      <div className="town-hall-build__looks">
        {built && <img src={auctionHouseLook(h.level)} alt="" />}
        {built && cost && <ArrowRight className="town-hall-build__arrow" aria-hidden="true" />}
        {cost && (
          <img
            className={built ? "town-hall-build__next" : undefined}
            src={auctionHouseLook(h.level + 1)}
            alt=""
          />
        )}
      </div>
      <div className="town-hall-build__info">
        <h2>{ru ? "Аукционный дом" : "Auction house"}</h2>
        <p>
          <b>
            {ru ? "ур." : "Lv"} {h.level}/{h.maxLevel}
          </b>
          <span>
            {ru ? "комиссия" : "fee"} {fee}
          </span>
        </p>
      </div>
      {cost && (
        <>
          <div className="town-hall-build__cost">
            {RES.map((r) => (
              <span key={r.key} className={short(r.key) ? "town-hall-build__lack" : undefined}>
                <img src={r.icon} alt="" />
                {cost[r.key].toLocaleString(ru ? "ru-RU" : "en-US")}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="town-hall-build__go"
            disabled={up.isPending || RES.some((r) => short(r.key))}
            onClick={() => up.mutate()}
          >
            {up.isPending ? <Loader2 className="town-hall-build__spin animate-spin" /> : <Hammer aria-hidden="true" />}
            {built ? (ru ? "Улучшить" : "Upgrade") : ru ? "Построить" : "Build"}
          </button>
        </>
      )}
    </section>
  );
}

