// Открытие окна банка из любого места: здание на площади, карточка в Ратуше, кнопка
// «Банк» рядом с аукционом в замке и на карте (владелец 21.10). Шина, как у аукциона:
// окно живёт в корне CastleGame и ChipsPage.
const OPEN = "bank:open";
const CLOSE = "bank:close";

export function openBank(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN));
}

export function closeBank(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CLOSE));
}

/** Подписка на открытие/закрытие. Возвращает отписку. */
export function onBankToggle(cb: (open: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const openH = () => cb(true);
  const closeH = () => cb(false);
  window.addEventListener(OPEN, openH);
  window.addEventListener(CLOSE, closeH);
  return () => {
    window.removeEventListener(OPEN, openH);
    window.removeEventListener(CLOSE, closeH);
  };
}
