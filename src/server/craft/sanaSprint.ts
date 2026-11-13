// SanaSprint 1.6B (NVIDIA / MIT HAN Lab) — официальный Space на Hugging Face,
// второй в цепочке лаборатории (generate.ts). Вызов «просит» всего 5 с квоты
// ZeroGPU (FLUX — 60 с), так что без ключа это десятки картинок в сутки с
// адреса. Замер 28.10: 3–6 с на картинку, предмет верный, русское описание
// понимает («наручи из коры дерева с листьями» — кора с листьями). Изредка
// «GPU task aborted» — подождать и повторить. Отрицательного запроса у Space
// нет — «один предмет» дописан в сам запрос. Веса Apache-2.0.
import type { Fetch, GenResult } from "./genTypes";
import { spaceImage } from "./zeroGpuSpace";

const SPACE = "https://efficient-large-model-sanasprint.hf.space";

export function sanaSprintImage(
  prompt: string,
  seed: number,
  f: Fetch = fetch,
): Promise<GenResult> {
  // prompt, model size, seed, randomize, width, height, guidance, steps
  return spaceImage(
    SPACE,
    [`${prompt}, single object only`, "1.6B", seed, false, 1024, 1024, 4.5, 2],
    f,
  );
}
