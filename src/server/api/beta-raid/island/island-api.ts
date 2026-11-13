// Ручки острова новичка. Пока только админам (владелец, 14.10.2026: «сейчас не
// выкатывай, сделай так, чтобы я и администраторы могли протестировать») и
// тестеру острова — дизайнеру (19.10, server/islandTester):
// войти на свой остров, выйти, сбросить и начать заново. Новичкам вход на
// остров не включён — их первая клетка по-прежнему у замка мира.
//
// Серверные модули острова грузятся внутри ручек: этот файл импортирует
// клиент, и генератор миров с SQL в его сборку попадать не должен.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isIslandTutorialPilot, requireIslandTester } from "@/server/islandTester";
import { getSessionTgId } from "@/server/auth";
import { requireBetaRaid } from "../gate";
import {
  ACK_STEPS,
  islandTutorialOrder,
  currentStep,
  stepTarget,
  type IslandPlaces,
  type IslandStepId,
} from "@/lib/raid/island/steps";
import type { Cell } from "@/lib/raid/worldgen/geo";
import { islandStepList, type IslandStepView } from "@/lib/raid/island/stepList";
import type { IslandHeroGranted } from "./island-hero-info";

export type { IslandHeroGranted } from "./island-hero-info";

export type IslandView = {
  /** null — остров пройден и снесён: осталось только окно основного мира. */
  mapId: string | null;
  onIsland: boolean;
  done: string[];
  current: IslandStepId | null;
  target: Cell | null;
  places: IslandPlaces;
  finished: boolean;
  /** Обучение пропущено (skipIslandTutorial): текущего шага нет, подсказки молчат. */
  skipped: boolean;
  /** Согласованный маршрут доступен только подтверждённому тестовому аккаунту. */
  pilot?: boolean;
  /** Оставшаяся реальная награда первого сундука: подшаг перед рюкзаком. */
  chestPending?: boolean;
  starterLineup?: import("./short-tutorial-squad").ShortStarterChip[];
  /** Все шаги по порядку с состояниями — окно рисует ровно их (stepList). */
  steps: IslandStepView[];
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
    // Остров с уроком (короткое обучение) — интерфейс пилота у всех (11.11).
    const short = !!row.places.lesson;
    const pilot = isIslandTutorialPilot(getSessionTgId()) || short;
    const pilotOrder = islandTutorialOrder(pilot, row.places);
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
        skipped: !!row.skippedAt,
        pilot,
        steps: islandStepList(done, row.places, true, pilotOrder),
      };
      return { island: view };
    }
    const { islandFacts } = await import("./island-facts");
    const facts = await islandFacts(account, row.mapId, row.places, done, !!row.resetAt);
    const fresh = facts.done.filter((s) => !done.has(s));
    if (fresh.length > 0) {
      await markDone(account, fresh, row.mapId);
      for (const s of fresh) done.add(s);
    }
    // Ушёл с острова не порталом (заклинание «домой») — «Сумка острова» не едет с ним.
    if (!facts.onIsland) {
      const { dropIslandBag } = await import("./island-move");
      await dropIslandBag(account).catch(() => {});
    }
    const starterLineup = short && !row.skippedAt && facts.onIsland && done.has("chest") && !done.has("slime")
      ? await (await import("./short-tutorial-squad")).prepareShortTutorialSquad(wallet, account) : undefined;
    const chestPending = short && done.has("chest") && !done.has("chest_backpack") && !done.has("skip:chest_backpack")
      ? await (await import("./short-tutorial-service")).shortChestPending(account, row.mapId) : false;
    const skipped = !!row.skippedAt;
    const current = skipped ? null : currentStep(done, row.places, pilotOrder);
    return {
      island: {
        mapId: row.mapId,
        onIsland: facts.onIsland,
        done: [...done],
        current,
        target: current ? stepTarget(current, row.places) : null,
        places: row.places,
        finished: !!row.finishedAt,
        skipped,
        pilot,
        chestPending,
        starterLineup,
        steps: islandStepList(done, row.places, skipped, pilotOrder),
      },
    };
  },
);

/**
 * Пропустить обучение (skip: true) или вернуть его (false). На аккаунт: новый
 * остров и выход порталом пропуск не сбрасывают; засчитанное остаётся; наград
 * за пропуск нет. Портал по-прежнему ждёт 8 ачивок.
 */
export const skipIslandTutorial = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ skip: z.boolean().default(true) }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const account = await accountOf(wallet);
    const { loadIsland, setTutorialSkip } = await import("./island-row");
    if (!(await loadIsland(account))) throw new Error("island.none");
    await setTutorialSkip(account, data.skip);
    return { ok: true as const, skipped: data.skip };
  });

/** Шаги, которые засчитывает «Понятно», и «final» — окно основного мира. */
const ACKABLE = [...ACK_STEPS, "final"] as const;

/** Прочитано объяснение шага (ACK_STEPS) или окно основного мира («final»). */
export const ackIsland = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ step: z.enum(ACKABLE), mapId: z.string().min(1).max(64).optional() }).parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const { markDone } = await import("./island-row");
    const account = await accountOf(wallet);
    if (data.mapId) {
      // Automatic view notes belong to this exact run, never to a restarted island.
      const { loadIsland, markViewedForMap } = await import("./island-row");
      const row = await loadIsland(account);
      if (!row || row.mapId !== data.mapId || !row.places.lesson || row.skippedAt)
        return { ok: true as const, recorded: false };
      if (data.step === "hero") {
        if (!row.done.includes("hero_pick")) return { ok: true as const, recorded: false };
        return { ok: true as const, recorded: await markViewedForMap(account, data.mapId, ["hero"]) };
      } else if (data.step === "chest_backpack") {
        const done = new Set(row.done);
        if (!done.has("chest")) {
          const { islandFacts } = await import("./island-facts");
          const facts = await islandFacts(account, data.mapId, row.places, done, !!row.resetAt);
          if (!facts.done.includes("chest")) return { ok: true as const, recorded: false };
        }
        const { shortChestPending } = await import("./short-tutorial-service");
        if (await shortChestPending(account, data.mapId)) return { ok: true as const, recorded: false };
        return { ok: true as const, recorded: await markViewedForMap(account, data.mapId, ["chest", "chest_backpack"]) };
      } else return { ok: true as const, recorded: false };
    }
    await markDone(account, [data.step]);
    return { ok: true as const, recorded: true };
  });

/** Тестер: на свой остров (нет острова — создать). Откуда пришёл — запоминаем. */
export const adminIslandEnter = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = await requireIslandTester();
  const { enterIsland } = await import("./island-admin");
  return enterIsland(wallet, await accountOf(wallet));
});

/** Тестер: с острова туда, откуда пришёл. */
export const adminIslandLeave = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = await requireIslandTester();
  const { leaveIsland } = await import("./island-admin");
  return leaveIsland(wallet, await accountOf(wallet));
});

/**
 * Тестер: обучение острова с нуля — только свой аккаунт (от кошелька сессии).
 * Снимок в историю, сброс отметок обучения и новый остров; вещи, балансы, герои
 * и ачивки не трогает, повторно ничего не выдаёт (island-tutorial-reset).
 */
export const adminIslandTutorialRestart = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = await requireIslandTester();
  const { restartIslandTutorial } = await import("./island-tutorial-reset");
  return restartIslandTutorial(wallet, await accountOf(wallet));
});

/** Тестер: снести остров и сгенерировать новый — задание с нуля. */
export const adminIslandReset = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = await requireIslandTester();
  const { resetIsland } = await import("./island-admin");
  return resetIsland(wallet, await accountOf(wallet));
});

export type IslandHeroPick = {
  /** true — на острове, героя острова ещё не выбирал. */
  need: boolean;
  options: Array<{ id: string; name: string; race: string; image: string | null }>;
};

/** Выбор расы героя-подарка острова: нужен ли и из кого. */
export const getIslandHeroPick = createServerFn({ method: "GET" }).handler(
  async (): Promise<IslandHeroPick> => {
    const wallet = await requireBetaRaid();
    const account = await accountOf(wallet);
    const { isLive, loadIsland } = await import("./island-row");
    const row = await loadIsland(account);
    if (!isLive(row)) return { need: false, options: [] };
    const { islandHeroOptions, islandHeroPicked } = await import("./island-gift");
    // Обучение начато заново — окно снова, пока выбор не сделан (героя второй раз не даст).
    const replay = !!row.resetAt && !row.done.includes("hero_pick");
    if (!replay && (await islandHeroPicked(account))) return { need: false, options: [] };
    return { need: true, options: await islandHeroOptions() };
  },
);

/** Герой выбранной расы — сразу в героях. Только у кого есть остров. */
export const pickIslandHero = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ templateId: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = await requireBetaRaid();
    const account = await accountOf(wallet);
    const { isLive, loadIsland, markDone } = await import("./island-row");
    if (!isLive(await loadIsland(account))) throw new Error("island.none");
    const { pickIslandHero: pick } = await import("./island-gift");
    const got = await pick(wallet, account, data.templateId);
    // Шаг «Герой в подарок» — сам выбор (после сброса обучения факт героя не в счёт).
    await markDone(account, ["hero_pick"]);
    // Окно результата: фактический герой (повторный выбор — прежний, alreadyHad).
    const { islandHeroOf } = await import("./island-hero-info");
    return { ok: true as const, hero: await islandHeroOf(account, got.alreadyHad) };
  });

/** Мой герой острова (для окна результата после перезахода); не выбирал — null. */
export const getMyIslandHero = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ hero: IslandHeroGranted | null }> => {
    const wallet = await requireBetaRaid();
    const { islandHeroOf } = await import("./island-hero-info");
    return { hero: await islandHeroOf(await accountOf(wallet), true) };
  },
);

