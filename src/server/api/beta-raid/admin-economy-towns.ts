// Список ратуш карты: жители, производство, потребление, запасы, норма.
//
// Читаем raid_town.config + raid_town_stock. Всё уже есть в готовом виде —
// правило ≤250 строк остаётся невспотевшим.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { cityNorm, dailyNeed, safeParseTownConfig } from "@/lib/townConfig";
import type { TownRow, TownGoodLine } from "./admin-economy-types";

type Row = { q: number; r: number; config: unknown };
type StockRow = { q: number; r: number; good_id: string; amount: number };

export async function buildTowns(mapId: string): Promise<TownRow[]> {
  const [towns, stock] = await Promise.all([fetchTowns(mapId), fetchStock(mapId)]);
  const stockIdx = new Map<string, number>();
  for (const s of stock) {
    stockIdx.set(`${s.q},${s.r}:${s.good_id}`, Number(s.amount) || 0);
  }
  return towns.map((t) => {
    const cfg = safeParseTownConfig(t.config);
    const goods: TownGoodLine[] = cfg.goods.map((g) => ({
      goodId: g.id,
      // У города имя = его id (админ вводит текст в поле «имя товара»),
      // отдельного name нет.
      name: g.id,
      image: null,
      consumePerDay: dailyNeed(g, cfg.residents),
      producePerDay: Number(g.producePerDay) || 0,
      stock: stockIdx.get(`${t.q},${t.r}:${g.id}`) ?? 0,
      norm: cityNorm(g, cfg.residents),
    }));
    return {
      q: Number(t.q),
      r: Number(t.r),
      // Названный город — своим именем (владелец, 05.10.2026), безымянный — местом.
      name: cfg.name || `Ратуша @ ${t.q},${t.r}`,
      residents: Number(cfg.residents) || 0,
      goods,
    };
  });
}

async function fetchTowns(mapId: string): Promise<Row[]> {
  const rows = (await mcpExec(
    `SELECT q, r, config FROM yuplink.raid_town WHERE map_id=${sqlStr(mapId)};`,
    { wrapJson: true },
  ).catch(() => [])) as Row[];
  return rows ?? [];
}

async function fetchStock(mapId: string): Promise<StockRow[]> {
  const rows = (await mcpExec(
    `SELECT q, r, good_id, amount FROM yuplink.raid_town_stock
      WHERE map_id=${sqlStr(mapId)};`,
    { wrapJson: true },
  ).catch(() => [])) as StockRow[];
  return rows ?? [];
}
