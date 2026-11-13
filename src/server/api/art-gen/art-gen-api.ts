// Генератор артефактов (§8.122) — ручки окна постройки. Серверные модули
// грузятся внутри ручек: файл импортирует клиент, а SQL, sharp и сеть в его
// сборке не нужны.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { CRAFT_RARITIES } from "@/lib/craft/craftTable";
import type { GenJobView } from "./art-gen-view";

const cell = { q: z.number().int(), r: z.number().int() };
const op = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);
const id = z.string().regex(/^[A-Za-z0-9_-]{6,40}$/);

/**
 * Мои задания (последние) и сколько генераций сегодня осталось на всех — заодно возврат
 * за не вышедшие. С fal.ai предела нет (§8.122) — left null, строки «Осталось» нет.
 */
export const getArtGenJobs = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    jobs: GenJobView[];
    left: number | null;
    max: number;
    /** Какой по счёту будет следующий заказ подряд (цена — stepPrice); null — ждать resetAt. */
    step: number | null;
    resetAt: number | null;
  }> => {
    const wallet = await requireBetaRaid();
    const { raidOwner } = await import("@/server/api/beta-raid/owner");
    const account = await raidOwner(wallet);
    const { refundFailed } = await import("./art-gen-order");
    await refundFailed(account);
    const { listGenJobs } = await import("./art-gen-view");
    const { genGate, genWorldLeft, GEN_WORLD_DAY_LIMIT } = await import("./art-gen-sql");
    const { falOn } = await import("@/server/craft/falAi");
    const [jobs, left, gate] = await Promise.all([
      listGenJobs(account),
      falOn() ? null : genWorldLeft(),
      genGate(account),
    ]);
    return { jobs, left, max: GEN_WORLD_DAY_LIMIT, step: gate.step, resetAt: gate.resetAt };
  },
);

export const orderArtGen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        ...cell,
        rarity: z.enum(CRAFT_RARITIES),
        words: z.string().max(400),
        op,
        // Какой по счёту заказ видело окно — цена на кнопке (artGenStep). Старое окно
        // без него — как первый: не первый — сервер ответит «цена изменилась».
        step: z.number().int().min(1).max(5).default(1),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ job: GenJobView }> => {
    const wallet = await requireBetaRaid();
    const m = await import("./art-gen-order");
    return { job: await m.orderArtGen(wallet, data) };
  });

/** Продвинуть своё задание: окно зовёт раз в несколько секунд, пока оно рисуется. */
export const tickArtGen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id }).strict().parse(d))
  .handler(async ({ data }): Promise<{ job: GenJobView }> => {
    const wallet = await requireBetaRaid();
    const m = await import("./art-gen-order");
    return { job: await m.tickArtGen(wallet, data.id) };
  });

/** Ключа клиента нет: ключ попытки ставит сервер (art-gen-unique), повтор платит заново. */
export const uniqueInput = z.object({ ...cell, id }).strict();

export const uniqueArtGen = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => uniqueInput.parse(d))
  .handler(async ({ data }): Promise<{ job: GenJobView }> => {
    const wallet = await requireBetaRaid();
    const m = await import("./art-gen-unique");
    return { job: await m.makeGenUnique(wallet, data) };
  });
