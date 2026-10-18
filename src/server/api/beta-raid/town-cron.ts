// Суточный тик города: жители едят, город решает, голодает ли, и производит
// своё: заданное в пульте плюс добычу с окрестности (town-area).
//
// Порядок по правилам владельца (03.10.2026):
//   1) жители съедают суточную норму каждой еды — до нуля, ниже не бывает;
//   2) не хватило хоть чего-то — город голодает СРАЗУ, без отсрочки в сутки;
//      голодал и каждой еды снова на сутки — голод снят;
//   3) производство и добыча — всегда, голодный город тоже (16.10.2026):
//      голод закрывает только привязанные лавки.
//
// Каждое движение склада — с ключом, где есть дата (town-stock.moveStock):
// второй прогон тика в те же сутки ничего не съест и не произведёт заново —
// крон зовут и из daily-likes, и отдельным /api/cron/towns.
import { mcpExec } from "../../db/mcpClient";
import { ensureTownSchema } from "./town-resolve";
import { moveStock, readTownStock, seedTownStock, type TownKey } from "./town-stock";
import { decideStarving, setStarving, townFed } from "./town-state";
import { mapHalls, townAreaYield } from "./town-area";
import { areaOf, type Hex } from "@/lib/townYield";
import { FLOOR_NORMS } from "@/lib/townPricing";
import {
  cityNorm,
  dailyNeed,
  isUpkeep,
  safeParseTownConfig,
  type TownConfig,
} from "@/lib/townConfig";

type TownRow = {
  map_id: string;
  q: number;
  r: number;
  config: unknown;
  starving_since: string | null;
};

/** Сутки тика — по UTC, как и сам крон (00:00 UTC). */
export const tickDay = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * Пройтись по всем ратушам всех карт.
 *
 * Возврат: сколько ратуш, сколько движений склада и сколько городов голодает —
 * по числам в логах видно, что крон реально пришёл, а не просто «ответил ок».
 */
export async function runTownDailyTick(
  now = new Date(),
): Promise<{ towns: number; goods: number; starving: number }> {
  await ensureTownSchema();
  const rows = (await mcpExec(
    `SELECT map_id, q, r, config, starving_since FROM yuplink.raid_town;`,
    { wrapJson: true },
  ).catch(() => [])) as TownRow[];

  let moved = 0;
  let starving = 0;
  const hallsOf = new Map<string, Promise<Hex[]>>();
  for (const row of rows ?? []) {
    const town: TownKey = { mapId: String(row.map_id), q: Number(row.q), r: Number(row.r) };
    const cfg = safeParseTownConfig(row.config);
    if (cfg.goods.length === 0) continue;
    // Окрестность не прочиталась — город живёт заданным в пульте, тик идёт.
    if (!hallsOf.has(town.mapId))
      hallsOf.set(
        town.mapId,
        mapHalls(town.mapId).catch(() => []),
      );
    const halls = await hallsOf.get(town.mapId)!;
    const area = await townAreaYield(town, halls).catch((e) => {
      console.warn("[town-tick] окрестность не прочиталась:", `${town.q},${town.r}`, e);
      return {} as Record<string, number>;
    });
    const res = await tickTown(town, cfg, !!row.starving_since, tickDay(now), area).catch((e) => {
      console.warn("[town-tick] город пропущен:", `${town.q},${town.r}`, e);
      return null;
    });
    if (!res) continue;
    moved += res.moved;
    if (res.starving) starving++;
  }
  return { towns: rows?.length ?? 0, goods: moved, starving };
}

/** Один город за сутки. area — добыча с окрестности: id товара → в сутки. */
export async function tickTown(
  town: TownKey,
  cfg: TownConfig,
  wasStarving: boolean,
  day: string,
  area: Record<string, number> = {},
): Promise<{ moved: number; starving: boolean }> {
  await seedTownStock(town, cfg.goods, cfg.residents);
  const key = (goodId: string, what: string) =>
    `tick:${day}:${town.mapId}:${town.q},${town.r}:${goodId}:${what}`;
  let moved = 0;

  // 1) Жители едят. Нехватка видна по запасу ДО еды: меньше суточной нормы.
  // Считается только СВЕЖАЯ еда: повторный прогон в те же сутки получает из
  // журнала утреннее «до» и иначе снова уморил бы город, который игроки уже
  // накормили (критик, 03.10.2026).
  let short = false;
  for (const g of cfg.goods.filter(isUpkeep)) {
    const need = dailyNeed(g, cfg.residents);
    if (!(need > 0)) continue;
    const mv = await moveStock(town, g.id, key(g.id, "eat"), { kind: "eat", need });
    if (!mv?.fresh) continue;
    if (mv.before + 1e-9 < need) short = true;
    if (mv.after !== mv.before) moved++;
  }

  // 2) Голод — сразу; снятие — когда еды снова не меньше порога.
  const fed = townFed(cfg, await readTownStock(town));
  const starving = decideStarving({ short, wasStarving, fed });
  if (starving !== wasStarving) await setStarving(town, starving);

  // 3) Производство и добыча идут ВСЕГДА, и у голодного города тоже (владелец,
  //    16.10.2026): голод закрывает только лавки — жители требуют еды. Раньше
  //    голодный город не производил ничего, и один пустой товар останавливал
  //    все остальные (за неделю до правки — 19 % дней без производства).
  for (const g of cfg.goods) {
    const add = Math.max(0, g.producePerDay) + areaOf(g, area);
    if (!(add > 0)) continue;
    // Дальше 20 норм цена уже «за бесценок» — больше производить незачем.
    const ceil = cityNorm(g, cfg.residents) * FLOOR_NORMS;
    const mv = await moveStock(town, g.id, key(g.id, "make"), {
      kind: "produce",
      add,
      ceil,
    });
    if (mv?.fresh && mv.after !== mv.before) moved++;
  }
  return { moved, starving };
}
