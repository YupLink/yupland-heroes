// Открытие окна Архитектора из любого места замка (здание на площади, карточка в
// Ратуше). Шина, как у банка: у них нет общего родителя, а окно живёт в корне
// CastleGame.
const OPEN = "architect:open";
const CLOSE = "architect:close";

export function openArchitect(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN));
}

export function closeArchitect(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CLOSE));
}

/** Подписка на открытие/закрытие. Возвращает отписку. */
export function onArchitectToggle(cb: (open: boolean) => void): () => void {
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
