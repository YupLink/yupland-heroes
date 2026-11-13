// Только обёртки для клиента: работа с БД остаётся в серверном модуле.
import { createServerFn } from "@tanstack/react-start";

export const skipShortTutorialStep = createServerFn({ method: "POST" }).handler(async () =>
  (await import("./short-tutorial-service")).skipShortTutorialStep());
export const getShortTutorialReward = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./short-tutorial-service")).getShortTutorialReward());
export const claimShortTutorialSpell = createServerFn({ method: "POST" }).handler(async () =>
  (await import("./short-tutorial-service")).claimShortTutorialSpell());
