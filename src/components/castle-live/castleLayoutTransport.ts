/** Copy into the game beside castleLayoutClient.ts after the reviewed client patch is applied. */
import { getCastleLayout, saveCastleLayout } from "@/server/api/castle-layout/castle-layout";
import type { ModularLayoutItem } from "@/server/api/castle-layout/layout-schema";
import type { LayoutTransport } from "./castleLayoutClient";

export const castleLayoutTransport: LayoutTransport<ModularLayoutItem> = {
  load: () => getCastleLayout(),
  save: ({ revision, layout }) => saveCastleLayout({ data: { revision, layout } }),
};
