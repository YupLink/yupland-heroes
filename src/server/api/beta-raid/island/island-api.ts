// Ручки острова новичка. Пока только админам (владелец, 14.10.2026: «сейчас не
// выкатывай, сделай так, чтобы я и администраторы могли протестировать»):
// войти на свой остров, выйти, сбросить и начать заново. Новичкам вход на
// остров не включён — их первая клетка по-прежнему у замка мира.
//
// Серверные модули острова грузятся внутри ручек: этот файл импортирует
// клиент, и генератор миров с SQL в его сборку попадать не должен.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { requireBetaRaid } from "../gate";
import {
  ACK_STEPS,
  currentStep,
  stepTarget,
  type IslandPlaces,
  type IslandStepId,
} from "@/lib/raid/island/steps";
import type { Cell } from "@/lib/raid/worldgen/geo";

export type IslandView = {
  /** null — остров пройден и снесён: осталось только окно основного мира. */
  mapId: string | null;
  onIsland: boolean;
  done: string[];
  current: IslandStepId | null;
  target: Cell | null;
  places: IslandPlaces;
  finished: boolean;
};

async function accountOf(wallet: string): Promise<string> {
  const { raidOwner } = await import("../owner");
  return raidOwner(wallet);
}

/** Остров игрока и его задание; шаги засчитываются здесь же, по фактам карты. */
export const getMyIsland = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ island: IslandView | null }> => {
    const wallet = await requireBetaRaid();
    const account = await accountOf(wallet);
    const { loadIsland, markDone } = await import("./island-row");
    const row = await loadIsland(account);
    if (!row) return { island: null };
    const done = new Set(row.done);
    if (!row.mapId) {
      // Карту снесли после выхода порталом: фактов нет, есть «прошёл».
      const view: IslandView = {
        mapId: null,
        onIsland: false,
        done: [...done],
        current: null,
        target: null,
        places: row.places,
        finished: !!row.finishedAt,
      };
      return { island: view };
    }
    const { islandFacts } = await import("./island-facts");
    const facts = await islandFacts(account, row.mapId, row.places, done);
    const fresh = facts.done.filter((s) => !done.has(s));
    if (fresh.length > 0) {
      await markDone(account, fresh);
      for (const s of fresh) done.add(s);
    }
    // Ушёл с острова не порталом (заклинание «домой») — «Сумка острова» не едет с ним.
    if (!facts.onIsland) {
      const { dropIslandBag } = await import("./island-move");
      await dropIslandBag(account).catch(() => {});
    }
    const current = currentStep(done, row.places);
    return {
      island: {
        mapId: row.mapId,
        onIsland: facts.onIsland,
        done: [...done],
        current,
        target: current ? stepTarget(current, row.places) : null,
        places: row.places,
        finished: !!row.finishedAt,
      },
    };
  },
);

/** Шаги, которые засчитывает «Понятно», и «final» — окно основного мира. */
const ACKABLE = [...ACK_STEPS, "final"] as const;

/** Прочитано объяснение шага (ACK_STEPS) или окно основного мира («final»). */
export const ackIsland = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ step: z.enum(ACKABLE) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const { markDone } = await import("./island-row");
    await markDone(await accountOf(wallet), [data.step]);
    return { ok: true as const };
  });

/** Админ: на свой остров (нет острова — создать). Откуда пришёл — запоминаем. */
export const adminIslandEnter = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = requireAdmin();
  const { enterIsland } = await import("./island-admin");
  return enterIsland(wallet, await accountOf(wallet));
});

/** Админ: с острова туда, откуда пришёл. */
export const adminIslandLeave = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = requireAdmin();
  const { leaveIsland } = await import("./island-admin");
  return leaveIsland(wallet, await accountOf(wallet));
});

/** Админ: снести остров и сгенерировать новый — задание с нуля. */
export const adminIslandReset = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = requireAdmin();
  const { resetIsland } = await import("./island-admin");
  return resetIsland(wallet, await accountOf(wallet));
});
