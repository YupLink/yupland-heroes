/** Presentation only: compares the current price per ticket in the same payment route. */
export type DiscountMethod = {
  kind: "energy" | "token" | "stars"; price: number; unit: string;
  usdToken?: "USDT" | "Darai" | "STARS"; ftContract?: string | null; decimals?: number | null;
};
export type DiscountOffer = { tickets: number; methods: DiscountMethod[] };

function currency(method: DiscountMethod): string {
  if (method.kind === "energy") return "energy";
  if (method.kind === "stars") return "stars";
  return (method.usdToken ?? method.unit).trim().toLowerCase();
}
function route(method: DiscountMethod): string {
  return method.usdToken ? "account" : method.kind === "energy" ? "portal"
    : `wallet:${method.ftContract ?? ""}:${method.decimals ?? ""}`;
}
export function ticketDiscountPercent(offers: readonly DiscountOffer[], tickets: number, method: DiscountMethod): number | null {
  const name = currency(method);
  const baseTickets = name === "energy" ? 1 : name === "darai" || name === "usdt" ? 5 : name === "gdarai" ? 2 : null;
  if (baseTickets == null || tickets <= baseTickets || !Number.isFinite(tickets) ||
      !Number.isFinite(method.price) || method.price <= 0) return null;
  const bases = offers.filter(offer => offer.tickets === baseTickets)
    .flatMap(offer => offer.methods)
    .filter(base => currency(base) === name && route(base) === route(method) &&
      Number.isFinite(base.price) && base.price > 0);
  if (!bases.length) return null;
  // Use the cheapest available base offer; duplicate rows must not inflate a saving.
  const basePrice = Math.min(...bases.map(base => base.price));
  const percent = Math.round((1 - method.price * baseTickets / (basePrice * tickets)) * 100);
  return percent > 0 && percent < 100 ? percent : null;
}
