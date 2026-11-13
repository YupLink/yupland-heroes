import { currencyLabel } from "@/lib/auctionCurrency";

const ICONS: Record<string, string> = {
  "res:gold": "/resources/gold.webp", "res:wood": "/resources/wood.webp",
  "res:stone": "/resources/stone.webp", "res:diamonds": "/resources/crystal.webp",
  energy: "/resources/energy.webp",
};
/** Unknown token symbols stay explicit; never label them with a gold icon. */
export function AuctionCurrency({ currency, en }: { currency: string; en: boolean }) {
  const label = currencyLabel(currency, en);
  return ICONS[currency] ? <img className="auction-money-icon" src={ICONS[currency]} alt={label} /> : <i>{label}</i>;
}
