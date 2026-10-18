// Карта мира, открытая из замка (CastleGame). Кружок замка в HUD работает по
// правилу владельца (07.10.2026): первое нажатие везёт камеру к СВОЕМУ
// основному замку, второе — входит в замок, если герой у него, иначе
// «герой не в замке». Вне замка контекста нет — кружок как раньше.
import { createContext, useContext, type ReactNode } from "react";

export type CastleMode = {
  /** Основной замок игрока (ратуша или центр); null — ещё не знаем. */
  openProfile?: () => void;
  home: { q: number; r: number } | null;
  /** Войти в замок — проверка «герой у замка» внутри (useHomeCastle). */
  enter: () => void;
  /** Direct entry from a specific building card; never starts movement. */
  enterAt?: (q: number, r: number) => Promise<boolean>;
  /** Кнопка профиля в правом верхнем углу карты (профиль доступен всегда). */
  profileButton: ReactNode;
  /** Экран таверны замка — у любой таверны мира. */
  openTavern: () => void;
};

export const CastleModeContext = createContext<CastleMode | null>(null);

export const useCastleMode = () => useContext(CastleModeContext);
