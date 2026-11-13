// Роли клеток острова из базы (raid_island.places, jsonb) → IslandPlaces.
// Вынесено из steps.ts (26.10.2026); импортировать можно и оттуда.
import type { Cell } from "@/lib/raid/worldgen/geo";
import type { IslandPlaces } from "./steps";

const isCell = (v: unknown): v is Cell => {
  const c = v as Cell | null;
  return !!c && Number.isInteger(c.q) && Number.isInteger(c.r);
};
const cells = (v: unknown): Cell[] => (Array.isArray(v) ? v.filter(isCell) : []);

/** Разбор ролей из базы (jsonb): мусор — пустые списки, без падения окна. */
export function parsePlaces(raw: unknown): IslandPlaces | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const one = ["spawn", "chest", "workshop", "mine", "treasure", "portal"] as const;
  if (!one.every((k) => isCell(o[k]))) return null;
  return {
    ...(parseLesson(o.lesson) ? { lesson: parseLesson(o.lesson)! } : {}),
    spawn: o.spawn as Cell,
    chest: o.chest as Cell,
    workshop: o.workshop as Cell,
    trees: cells(o.trees),
    monsters: cells(o.monsters),
    // Сохранённый null — «призов нет» (с 20.10). Ключа нет — острова до 15.10:
    // артефакт у второго слизня, пак у хомяка (или нет).
    artifact: isCell(o.artifact)
      ? o.artifact
      : "artifact" in o
        ? null
        : (cells(o.monsters)[1] ?? null),
    pack: isCell(o.pack) ? o.pack : isCell(o.hamster) ? o.hamster : null,
    crystals: cells(o.crystals),
    mine: o.mine as Cell,
    mines: cells(o.mines),
    treasure: o.treasure as Cell,
    digs: cells(o.digs),
    shipyard: isCell(o.shipyard) ? o.shipyard : null,
    gift: o.gift === true,
    portal: o.portal as Cell,
    hall: isCell(o.hall) ? o.hall : null,
  };
}

function parseLesson(raw: unknown): import("./shortTutorial").ShortLesson | undefined {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (o.version !== 1 || !isCell(o.shore)) return undefined;
  const water = cells(o.water);
  // Урок у столба: у генератора островок 7 клеток и 30 воды; у копии образца цель
  // переправы подогнана под её воду (shortLessonFit, 11.11) — размеры свои.
  if (isCell(o.pillar) && cells(o.islet).length > 0 && water.length > 0)
    return { version: 1, shore: o.shore, water, pillar: o.pillar, islet: cells(o.islet) };
  if (water.length === 19) return { version: 1, shore: o.shore, water };
  return undefined;
}

