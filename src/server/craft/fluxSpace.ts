// FLUX.1-schnell (black-forest-labs) на Hugging Face — третий в цепочке
// лаборатории (generate.ts). Рисует лучше всех, но вызов «просит» 60 с квоты
// ZeroGPU: без ключа — единицы картинок в сутки (замер 25.10: 7 подряд, потом
// часами отказ).
import type { Fetch, GenResult } from "./genTypes";
import { spaceImage } from "./zeroGpuSpace";

const SPACE = "https://black-forest-labs-flux-1-schnell.hf.space";
const SIZE = 768;

export function fluxImage(prompt: string, seed: number, f: Fetch = fetch): Promise<GenResult> {
  // prompt, seed, randomize, width, height, steps
  return spaceImage(SPACE, [prompt, seed, false, SIZE, SIZE, 4], f);
}
