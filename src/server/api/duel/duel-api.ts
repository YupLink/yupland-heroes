// Ручки песочницы дуэли — только админам (владелец 04.11.2026: «только для
// админов, отдельной вкладкой пока что»). Серверные модули — внутри ручек:
// файл импортирует клиент.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DuelHero, DuelSetup, MobDuelStats } from "./duel-store";
import { MAX_MOVE, MAX_RANGE } from "@/lib/duel/rules";

export type { DuelHero, DuelMob, DuelSetup, DuelHeroRow, MobDuelStats } from "./duel-store";
export type { DuelField } from "./duel-field";

async function admin(): Promise<string> {
  const { requireAdmin } = await import("@/server/auth");
  return requireAdmin();
}

const store = () => import("./duel-store");

export const getDuelSetup = createServerFn({ method: "GET" }).handler(
  async (): Promise<DuelSetup> => (await store()).duelSetup(await admin()),
);

export const getDuelHero = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ heroId: z.string().min(1).max(80) }).parse(d))
  .handler(
    async ({ data }): Promise<DuelHero> => (await store()).duelHero(await admin(), data.heroId),
  );

/** Итог боя: жизни ваших мобов — в следующий бой (владелец 09.11.2026, duel-mob-hp.ts). */
export const saveDuelMobs = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        mobs: z
          .array(
            z.object({
              template: z.string().min(1).max(80),
              copy: z.number().int().min(0).max(3),
              hp: z.number().min(0).max(1e15),
            }),
          )
          .max(4),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const wallet = await admin();
    const { accountOf } = await import("@/server/api/user-shared");
    const { saveMobHp } = await import("./duel-mob-hp");
    await saveMobHp(await accountOf(wallet), data.mobs);
    return { ok: true };
  });

/** Ход и дальность моба правит тот же, кто правит шаблоны мобов (без денег — не важно). */
async function catalogs(): Promise<void> {
  const { requireCatalogEditor } = await import("@/server/api/catalog-auth");
  await requireCatalogEditor();
}

const mobId = z.string().min(1).max(80);

export const getMobDuelStats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: mobId }).parse(d))
  .handler(async ({ data }): Promise<MobDuelStats> => {
    await catalogs();
    return (await store()).mobDuelStats(data.id);
  });

export const saveMobDuelStats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: mobId,
        move: z.number().int().min(1).max(MAX_MOVE).nullable(),
        range: z.number().int().min(2).max(MAX_RANGE).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await catalogs();
    await (await store()).setMobDuelStats(data.id, { move: data.move, range: data.range });
    return { ok: true };
  });
