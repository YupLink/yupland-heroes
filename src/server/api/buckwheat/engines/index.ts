// Создаёт scripts/buckwheat-sync.mjs — руками не править.
// Правила «Короны» всех версий: партия доигрывается по тем, с которыми начата.
import * as e28f6f3dcf034 from "./28f6f3dcf034.mjs";

/** Что сервер берёт из правил игры — по типам текущей версии. */
export type BwRules = typeof import("../../../../../minigames/buckwheat/src/engine.mjs");

export const CURRENT_ENGINE = "28f6f3dcf034";

export const ENGINES: Record<string, BwRules> = {
  "28f6f3dcf034": e28f6f3dcf034 as unknown as BwRules,
};
