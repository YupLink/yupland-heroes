// Ловля руками на острове новичка (lib/raid/handFish): берег, без удочки,
// одна попытка за нажатие. Сначала сытость (мало — отказ), потом энергия (мало —
// сытость назад), потом бросок на сервере (зерно — случайное, не от клиента):
// рыба — в рюкзак, что не влезло — мешочком на клетке рыбака (fishing-deliver),
// ачивка «Рыбак».
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { isAdminWallet } from "@/server/auth";
import { FISHING_ADMIN_ONLY } from "@/lib/featureGates";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { energyMultOf, scaleEnergy } from "@/lib/raid/island/energy";
import { catchItemOf, fishHit, type FishCatch } from "@/lib/raid/fishing";
import { chancePlanOf } from "@/lib/raid/fishChanceSteps";
import {
  HAND_FISH_ENERGY,
  HAND_FISH_HUNGRY,
  HAND_FISH_ISLAND_ONLY,
  HAND_FISH_SATIETY,
  HAND_FISH_SOURCE,
} from "@/lib/raid/handFish";
import { bagActor } from "@/server/api/beta-raid/loot-bag/bag-actor";
import { ownCell } from "@/server/api/beta-raid/encounter-where";
import { loadFishingConfig } from "@/server/api/beta-raid/fishing/fishing-config";
import { fishBonusOf } from "@/server/api/beta-raid/fishing/fishing-bonus";
import { CANT_FISH, shoreSql } from "@/server/api/beta-raid/fishing/fishing-sql";
import { deliverCatch } from "@/server/api/beta-raid/fishing/fishing-deliver";
import { bumpAchievement } from "@/server/api/achievements/bump";

export type HandFishResult = { got: FishCatch[]; energy: number; satiety: number };

export const fishByHand = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({})
      .passthrough()
      .parse(d ?? {}),
  )
  .handler(async (): Promise<HandFishResult> => {
    const a = await bagActor("fishing");
    if (!isIslandMapId(a.mapId)) throw new Error(HAND_FISH_ISLAND_ONLY);
    if (FISHING_ADMIN_ONLY && !isAdminWallet(a.wallet)) throw new Error("fish.off");
    const cfg = await loadFishingConfig();
    if (cfg.items.length === 0) throw new Error("fish.off");
    const pos = await ownCell(a.wallet);
    if (!pos) throw new Error(CANT_FISH);
    const shore = (await mcpExec(shoreSql({ mapId: a.mapId, q: pos.q, r: pos.r }), {
      wrapJson: true,
    })) as Array<{ land: boolean; water: boolean }>;
    if (shore?.[0]?.land !== true || shore[0].water !== true) throw new Error(CANT_FISH);

    // Сытость, потом энергия — как рубка руками (decor-interact).
    const { payHandSatiety } = await import("@/server/api/beta-raid/decor-hand");
    const fed = await payHandSatiety(a.wallet, a.mapId, HAND_FISH_SATIETY, HAND_FISH_HUNGRY);
    const energy = scaleEnergy(HAND_FISH_ENERGY, energyMultOf(a.mapId));
    const { payForHit } = await import("@/server/api/beta-raid/encounter-pay");
    try {
      await payForHit(a.wallet, energy, "other");
    } catch (e) {
      await fed.back();
      throw e;
    }

    const bonus = await fishBonusOf(a.wallet);
    const { chancePct } = chancePlanOf(cfg.chancePct + bonus.addPct, bonus.bonusPct, []);
    const sid = nanoid(21);
    const itemId = fishHit(sid, 1, chancePct) ? catchItemOf(cfg.items, sid, 1) : null;
    if (!itemId) return { got: [], energy, satiety: fed.satiety };
    const got = await deliverCatch({
      wallet: a.wallet,
      account: a.account,
      mapId: a.mapId,
      q: pos.q,
      r: pos.r,
      key: `fishhand:${a.account}:${sid}`,
      rodName: HAND_FISH_SOURCE,
      items: new Map([[itemId, 1]]),
      times: [Date.now()],
    });
    bumpAchievement(a.account, "fisher", 1);
    return { got, energy, satiety: fed.satiety };
  });
