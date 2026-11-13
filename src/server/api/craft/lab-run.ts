// Шаг задания лаборатории: нарисовать (цепочка бесплатных генераторов,
// server/craft/generate.ts) → снять фон и уложить в пиксель-сетку → сохранить →
// выдать артефакт. Шаг делает тот, кто взял аренду (claimJob): окно опрашивает
// задание, и два опроса разом не рисуют одно и то же дважды. Все генераторы
// заняты — задание ждёт; заказ ушёл в Horde — ждёт его, попытка не тратится;
// картинка не прошла проверку — минус попытка и новый посев. Бросок не
// меняется никогда.
import { randomBytes, randomInt } from "node:crypto";
import { generateStep } from "@/server/craft/generate";
import { falOn } from "@/server/craft/falAi";
import { formById } from "@/lib/craft/craftForms";
import { pixelArt } from "@/server/craft/artPixel";
import { saveCraftPng } from "@/server/craft/artFile";
import { claimJob, jobMiss, jobPending, jobWait, loadJob, type LabJob } from "./lab-sql";
import { finishJob } from "./lab-finish";

/** Сколько картинок пробуем на одно задание, прежде чем сказать «не вышло». */
export const MAX_TRIES = 4;

export type LabOwner = { wallet: string; account: string };

export async function advanceJob(owner: LabOwner, id: string): Promise<LabJob | null> {
  const token = randomBytes(8).toString("hex");
  const job = await claimJob(owner.account, id, token);
  if (!job) return loadJob(owner.account, id);
  const seed = job.ext?.seed ?? randomInt(1, 2_147_483_647);
  try {
    // Заказ игрока: бесплатные исчерпаны — платный fal.ai (§8.122); лаборатория — только бесплатные.
    const gen = await generateStep(job.prompt, seed, job.ext, fetch, job.kind === "gen" && falOn());
    if (gen.kind === "pending") {
      await jobPending(job.id, token, gen.ext, gen.seconds);
    } else if (gen.kind === "wait") {
      await jobWait(job.id, token, gen.seconds, `wait: ${gen.why}`);
    } else if (gen.kind === "fail") {
      await jobMiss(job.id, token, gen.why, MAX_TRIES);
    } else {
      const art = await pixelArt(gen.image, !!formById(job.form)?.holes);
      if (!art.ok) await jobMiss(job.id, token, art.why, MAX_TRIES);
      else {
        const url = await saveCraftPng(job.id, seed, art.png);
        await finishJob(job, owner, url, { seed, provider: gen.provider }, token);
      }
    }
  } catch (e) {
    await jobMiss(job.id, token, e instanceof Error ? e.message : "error", MAX_TRIES);
  }
  return loadJob(owner.account, id);
}
