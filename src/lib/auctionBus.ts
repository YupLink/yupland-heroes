// Открытие окна аукциона из любого места: кнопка в HUD замка и плашка на карте
// мира зовут одно и то же полноэкранное окно. Модуль-шина (как chipsNav):
// у них нет общего родителя со стейтом, а оверлей живёт в корне ChipsPage.
const OPEN = "auction:open";
const CLOSE = "auction:close";

/** Вкладка окна: лоты игры или лоты игроков (аукционный дом). */
export type AuctionTab = "game" | "player";

/** Открыть окно аукциона (здание дома в замке — сразу на «От игроков»). */
export function openAuction(tab: AuctionTab = "game"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AuctionTab>(OPEN, { detail: tab }));
}

/** Закрыть окно аукциона. */
export function closeAuction(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLOSE));
}

/** Подписка на открытие/закрытие. Возвращает отписку. */
export function onAuctionToggle(cb: (open: boolean, tab: AuctionTab) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const openH = (e: Event) =>
    cb(true, (e as CustomEvent<AuctionTab>).detail === "player" ? "player" : "game");
  const closeH = () => cb(false, "game");
  window.addEventListener(OPEN, openH);
  window.addEventListener(CLOSE, closeH);
  return () => {
    window.removeEventListener(OPEN, openH);
    window.removeEventListener(CLOSE, closeH);
  };
}
