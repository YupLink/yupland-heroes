/** UI navigation only. Auction availability is inherited from the source HUD. */
export type TradeRequest = { auctionAvailable: boolean; auctionCount: number };
const OPEN = 'trade:open';
export function openTrade(request: TradeRequest) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OPEN, { detail: request }));
}
export function onTradeOpen(callback: (request: TradeRequest) => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => callback((event as CustomEvent<TradeRequest>).detail);
  window.addEventListener(OPEN, listener);
  return () => window.removeEventListener(OPEN, listener);
}
