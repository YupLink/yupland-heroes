// Открытие окна банка из любого места замка (здание на площади, карточка в Ратуше).
// Шина, как у аукциона: у них нет общего родителя, а окно живёт в корне CastleGame.
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
