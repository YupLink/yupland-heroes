import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { upgradeAuctionHouse, type getAuctionHouse } from "@/server/api/game-auction";
import { houseSlots, type HouseCost } from "@/lib/auctionHouse";
import { refreshAuctionData } from "./auctionRefresh";
import { AuctionDialog } from "./AuctionDialog";

type House = Awaited<ReturnType<typeof getAuctionHouse>>;
const RES: Array<{ key: keyof HouseCost; image: string; ru: string; en: string }> = [
  { key: "wood", image: "/resources/wood.webp", ru: "Дерево", en: "Wood" },
  { key: "stone", image: "/resources/stone.webp", ru: "Камень", en: "Stone" },
  { key: "gold", image: "/resources/gold.webp", ru: "Золото", en: "Gold" },
  { key: "diamonds", image: "/resources/crystal.webp", ru: "Алмазы", en: "Diamonds" },
];

/** Existing upgrade API and its authoritative cost/resources; presentation only. */
export function AuctionHouseUpgrade({ house: h, en, onClose }: { house: House; en: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const up = useMutation({
    mutationFn: () => upgradeAuctionHouse({ data: { fromLevel: h.level, opId: crypto.randomUUID() } }),
    onSuccess: (r) => {
      toast.success(en ? `Auction house — level ${r.level}` : `Аукционный дом — уровень ${r.level}`);
      refreshAuctionData(qc); onClose();
    },
    onError: (e: unknown) => { toast.error(e instanceof Error ? e.message : String(e)); refreshAuctionData(qc); },
  });
  const cost = h.cost;
  const short = (key: keyof HouseCost) => !!cost && (h.resources[key] ?? 0) < cost[key];
  return <AuctionDialog title={en ? "Upgrade auction house" : "Улучшение аукционного дома"}
    closeLabel={en ? "Close" : "Закрыть"} onClose={onClose}>
    <p>{en ? "Level" : "Уровень"} {h.level} → {h.level + 1}</p>
    <dl className="auction-upgrade__benefits">
      <div><dt>{en ? "Lot slots" : "Мест для лотов"}</dt><dd>{h.slots} → {houseSlots(h.level + 1)}</dd></div>
      <div><dt>{en ? "Commission" : "Комиссия"}</dt><dd>{h.feePct}% → {h.nextFeePct}%</dd></div>
    </dl>
    {cost && <><p>{en ? "Upgrade cost" : "Стоимость улучшения"}</p>
      <div className="auction-upgrade__cost">{RES.map((r) => <span key={r.key} className={short(r.key) ? "auction-upgrade__short" : ""}>
        <img src={r.image} alt={en ? r.en : r.ru} />{cost[r.key].toLocaleString(en ? "en-US" : "ru-RU")}
      </span>)}</div>
      {RES.some((r) => short(r.key)) && <p role="status">{en ? "Not enough resources" : "Не хватает ресурсов"}</p>}
      <button type="button" className="auction-primary" disabled={up.isPending || RES.some((r) => short(r.key))} onClick={() => up.mutate()}>
        {up.isPending && <Loader2 className="animate-spin" />}{en ? "Upgrade" : "Улучшить"}
      </button></>}
  </AuctionDialog>;
}
