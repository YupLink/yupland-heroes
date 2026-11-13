// Основной замок: статус для входа в замок и смена (см. home-castle-core.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { activeBetaMapId, myMapId, ownCell } from "./encounter-where";
import { raidOwner } from "./owner";
import { isIslandMapId } from "@/lib/raid/island/ids";
import {
  homeMoveCost,
  homePlace,
  islandTownHere,
  placeHere,
  samePlace,
  setHome,
  type HomePlace,
} from "./home-castle-core";

export type HomeCastleStatus = {
  /** Основной замок игрока. */
  home: HomePlace;
  /** Замок или ратуша, у которых герой стоит сейчас (null — ни у чего). */
  here: HomePlace | null;
  /** Герой у основного замка — в замок можно войти. */
  atHome: boolean;
  /** Сколько стоит сделать основным то, у чего стоишь (0 — первый выбор). */
  cost: number;
  /** Герой на своём острове новичка: замок есть, основным его не сделать. */
  island?: boolean;
  /** Герой у ратуши другого мира (не главного, не острова): войти можно, основной — только в
   *  главном мире (владелец, 26.10.2026: «нет кнопки войти в северном замке»). */
  away?: boolean;
};

async function status(
  wallet: string,
): Promise<HomeCastleStatus & { account: string; mapId: string }> {
  const [account, main, mine, pos] = await Promise.all([
    raidOwner(wallet),
    activeBetaMapId(),
    myMapId(wallet),
    ownCell(wallet).catch(() => null),
  ]);
  // Основной замок — в главном мире. Войти — у любой ратуши (§8.61, 07.10): и на своём
  // острове новичка, и в другом мире (26.10) — ратуша на карте, где стоит герой. Там
  // координаты другой карты: «у основного» (atHome) и «сделать основным» — только в главном.
  const onMain = mine === main;
  const island = !onMain && isIslandMapId(mine);
  const away = !onMain && !island;
  const [home, here, cost] = await Promise.all([
    homePlace(account, main),
    onMain ? placeHere(main, pos) : islandTownHere(mine, pos),
    homeMoveCost(account),
  ]);
  const atHome = onMain && samePlace(home, here);
  return { account, mapId: main, home, here, atHome, cost, island, away };
}

export const getHomeCastle = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeCastleStatus> => {
    const wallet = await requireBetaRaid();
    const { home, here, atHome, cost, island, away } = await status(wallet);
    return { home, here, atHome, cost, island, away };
  },
);

/** Сделать основным замком то, у чего стоит герой. Место сервер берёт сам. */
export const setHomeCastle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ opId: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const s = await status(wallet);
    if (s.island) throw new Error("island.no_home");
    if (s.away) throw new Error("Основным можно сделать только замок или ратушу главного мира");
    if (!s.here) throw new Error("Подойди вплотную к замку или ратуше");
    // Повтор того же нажатия после успеха: уже основной — не ошибка и не плата.
    if (samePlace(s.here, s.home)) return { ok: true as const, cost: 0, home: s.home };
    await setHome({
      account: s.account,
      wallet,
      mapId: s.mapId,
      place: s.here,
      cost: s.cost,
      opId: data.opId,
    });
    return { ok: true as const, cost: s.cost, home: s.here };
  });

/** Где герой относительно замков — для окон замка (храм: молиться можно у замка). */
export { status as homeCastleStatus };
