// Тяжёлые экраны игры — по требованию (13.10.2026, замер: при входе качалось
// 1015 КБ кода, на первом экране выполнялось 30%). Карта мира (~200 КБ) и
// замок (~60 КБ) грузятся, только когда их показывают, — и заранее, по
// запомненному экрану игрока (lastScreen), чтобы не ждать «где герой».
// Окна профиля и таверны — при открытии.
import { lazy } from "react";

export const loadRaidScreen = () =>
  import("@/components/beta-raid/BetaRaidScreen").then((m) => ({ default: m.BetaRaidScreen }));
export const loadCastleView = () =>
  import("./CastleLiveView").then((m) => ({ default: m.CastleLiveView }));

export const LazyBetaRaidScreen = lazy(loadRaidScreen);
export const LazyCastleLiveView = lazy(loadCastleView);
export const LazyProfileOverlay = lazy(() =>
  import("./CastleProfileOverlay").then((m) => ({ default: m.CastleProfileOverlay })),
);
export const LazyTavernOverlay = lazy(() =>
  import("./CastleTavernOverlay").then((m) => ({ default: m.CastleTavernOverlay })),
);
/** Подсказки острова новичка в замке — только тем, кто сейчас на острове. */
export const LazyIslandCastleGuide = lazy(() =>
  import("@/components/beta-raid/island/IslandCastleGuide").then((m) => ({
    default: m.IslandCastleGuide,
  })),
);

/** Начать качать код экрана заранее; ошибку покажет сам экран при монтировании. */
export function preloadScreen(screen: "castle" | "raid"): void {
  void (screen === "raid" ? loadRaidScreen() : loadCastleView()).catch(() => {});
}
