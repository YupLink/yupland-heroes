// Окна замка, которые грузятся по первому открытию (CastleLiveView).
import { lazy } from "react";

export const Tavern = lazy(() => import("./TavernWindow").then((m) => ({ default: m.TavernWindow })));
export const Treasury = lazy(() =>
  import("./TreasuryScreen").then((m) => ({ default: m.TreasuryScreen })),
);
export const Barracks = lazy(() =>
  import("@/components/chips/castle-barracks/BarracksScreen").then((m) => ({ default: m.BarracksScreen })),
);
export const Shop = lazy(() => import("@/components/chips/ShopTab").then((m) => ({ default: m.ShopTab })));
// Рынок замка — своё окно; у игроков прежний MarketScreen.
export const Market = lazy(() => import("./CastleMarketWindow").then((m) => ({ default: m.CastleMarketWindow })));
export const Glory = lazy(() =>
  import("./GloryScreen").then((m) => ({
    default: m.GloryScreen,
  })),
);
export const Profile = lazy(() => import("./CastleProfile").then((m) => ({ default: m.CastleProfile })));
