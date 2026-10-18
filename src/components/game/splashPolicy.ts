// Заставка с Юпиком — окно загрузки: есть, пока грузится игра, без минимума.
import { createContext, useContext } from "react";

/**
 * Игра грузится под общей заставкой: свои экраны загрузки под ней не видны, и
 * второй, третий Юпик там только жгли бы кадры телефона и начинали путь заново.
 */
export const SplashCover = createContext(false);

export function useSplashCovered(): boolean {
  return useContext(SplashCover);
}
