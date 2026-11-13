// Цепочка бесплатных генераторов лаборатории (§8.81), по качеству:
// 0) FLUX.1-schnell на Cloudflare Workers AI — бесплатный ключ владельца,
//    ≈ 57 картинок в сутки, 2–3 с; нет ключа или кончился лимит — дальше;
// 1) SANA-1.6B — демо MIT HAN Lab: без ключа и без квоты, ~10 с (бывает
//    выключено: 28.10 Cloudflare отвечал 530 «error 1033»);
// 2) SanaSprint на Hugging Face — без ключа, 5 с квоты на картинку;
// 3) FLUX.1-schnell на Hugging Face — без ключа, 60 с квоты на картинку;
// 4) AI Horde — открытый ключ, без лимита, но очередь: заказ асинхронный.
// Заказ генератора артефактов (paid, §8.122): бесплатные исчерпаны или лежат —
// рисует платный fal.ai (владелец 11.11.2026: «когда лимит на генерацию в том,
// чем мы делали до этого, исчерпается»); не вышло и там — очередь Horde.
// Первый, кто нарисовал, — тот и автор. Все заняты — задание ждёт; все
// отказали — минус попытка.
import { cfImage } from "./cfWorkersAi";
import { falImage } from "./falAi";
import { fluxImage } from "./fluxSpace";
import type { Fetch } from "./genTypes";
import { hordeCheck, hordeSubmit, type HordeExt } from "./hordeAnon";
import { sanaImage } from "./sanaHanlab";
import { sanaSprintImage } from "./sanaSprint";

export type GenStep =
  | { kind: "ok"; image: Buffer; provider: string }
  | { kind: "pending"; seconds: number; ext: HordeExt }
  | { kind: "wait"; seconds: number; why: string }
  | { kind: "fail"; why: string };

/** ext — заказ в Horde из прошлого тика: тогда только спрашиваем, готов ли. */
export async function generateStep(
  prompt: string,
  seed: number,
  ext: HordeExt | null,
  f: Fetch = fetch,
  paid = false,
): Promise<GenStep> {
  if (ext?.provider === "horde") {
    const h = await hordeCheck(ext, f);
    return h.kind === "ok" ? { ...h, provider: `horde:${ext.model}` } : h;
  }
  const cf = await cfImage(prompt, f);
  if (cf.kind === "ok") return { ...cf, provider: "cf-flux-schnell" };
  const sana = await sanaImage(prompt, seed, f);
  if (sana.kind === "ok") return { ...sana, provider: "sana-hanlab" };
  const sprint = await sanaSprintImage(prompt, seed, f);
  if (sprint.kind === "ok") return { ...sprint, provider: "hf-sana-sprint" };
  const flux = await fluxImage(prompt, seed, f);
  if (flux.kind === "ok") return { ...flux, provider: "hf-flux-schnell" };
  const fal = paid ? await falImage(prompt, seed, f) : null;
  if (fal?.kind === "ok") return { ...fal, provider: "fal-flux-schnell" };
  const horde = await hordeSubmit(prompt, seed, f);
  if (horde.kind === "pending") return horde;
  if (horde.kind === "ok") return { ...horde, provider: "horde" };
  const tried = [cf, sana, sprint, flux, ...(fal ? [fal] : []), horde];
  const why = tried.map((r) => r.why).join(" | ");
  if (tried.every((r) => r.kind === "fail")) return { kind: "fail", why };
  const waits = tried.flatMap((r) => (r.kind === "wait" ? [r.seconds] : []));
  return { kind: "wait", seconds: Math.min(...waits), why };
}
