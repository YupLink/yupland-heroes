// Сытость выбранного героя: потратить на действие и наполнить едой
// (lib/hero/satiety — потолки и цены). Шаг по карте списывает сытость тем же
// оператором, что и энергию (move-step-sql), — здесь бой, захват шахты,
// подбор золота, рубка руками и еда.
//
// Шкала держится в пределах 0…потолок одним UPDATE: пусто в базе — полная.
// Перешли через ноль (наступил голод или кончился) — сбрасываем кэш силы героя:
// характеристики ×0,5 должны доехать до боя сразу, а не через 15 секунд.
import { mcpExec } from "../../db/mcpClient";
import { satietyMoveSql } from "./hero-satiety-sql";
import { satietyMax, satietyNow, type Satiety } from "@/lib/hero/satiety";
import { invalidateHeroPower, loadHeroView, type HeroPowerInfo } from "./hero-power";

type Row = { satiety: number | string | null };

/** Записанная шкала — в кэш силы героя; сменился голод — кэш сбросить. */
function remember(wallet: string, info: HeroPowerInfo, max: number, row: Row): Satiety {
  const now = satietyNow(row.satiety, max);
  const next = { now, max, hungry: now <= 0 };
  if (next.hungry !== info.satiety.hungry) invalidateHeroPower(wallet);
  // Кэш силы героя живёт 15 с — шкала в нём обязана быть свежей: её читает
  // состояние карты, а игрок смотрит, как она убывает.
  else info.satiety = next;
  return next;
}

/**
 * Сдвинуть сытость выбранного героя игрока. Героя нет (флаг, раса не
 * распознана) — null: действие идёт как раньше, без шкалы. Сбой записи не
 * роняет действие — сытость не стоит боя или подобранного золота.
 */
export async function moveSatiety(wallet: string, delta: number): Promise<Satiety | null> {
  if (!delta) return null;
  const view = await loadHeroView(wallet).catch(() => null);
  const info = view?.info;
  if (!info) return null;
  const max = satietyMax(info.rarity, info.spec);
  try {
    const rows = (await mcpExec(satietyMoveSql(info.heroId, max, delta), {
      wrapJsonCte: true,
    })) as Row[];
    if (!rows?.length) return null;
    return remember(wallet, info, max, rows[0]);
  } catch (e) {
    console.error("[satiety] не записалась:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Списать сытость, только если её не меньше need (рубка руками, §8.56):
 * условие в том же UPDATE — две рубки разом шкалу не обгонят. Героя нет —
 * "none" (действие идёт без шкалы, как бой); не хватило — "short". Сбой
 * записи — бросок: действие за сытость без сытости не идёт.
 */
export async function takeSatiety(wallet: string, need: number): Promise<"ok" | "none" | "short"> {
  const view = await loadHeroView(wallet).catch(() => null);
  const info = view?.info;
  if (!info) return "none";
  const max = satietyMax(info.rarity, info.spec);
  const m = Math.max(0, Math.round(max));
  const n = Number.isFinite(need) ? Math.max(0, need) : 0;
  const enough = `LEAST(${m}, COALESCE(h.satiety, ${m})) >= ${n}`;
  const rows = (await mcpExec(satietyMoveSql(info.heroId, max, -n, enough), {
    wrapJsonCte: true,
  })) as Row[];
  if (!rows?.length) return "short";
  remember(wallet, info, max, rows[0]);
  return "ok";
}
