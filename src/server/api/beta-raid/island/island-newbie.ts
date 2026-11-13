// Остров встречает каждого новичка (владелец, 06.11.2026: «теперь этот остров
// должен встречать всех новичков — старт где укажет Ангелина»). Новичок выбрал
// расу в меню входа (game-start-core) — ему создаётся свой остров (копия образца,
// island-master) и герой встаёт на старт острова. Кто уже играл, сюда не попадает:
// выбор расы бывает только у аккаунта без героев.
//
// Выключатель: settings.island_newbies = {"on": true}. Нет строки или on не true —
// новичок идёт в основной мир, как раньше (и 10 стартовых фишек получает, §8.47).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

export const ISLAND_NEWBIES_KEY = "island_newbies";
/**
 * Короткое обучение (13 шагов, история Кай) — всем новым островам (владелец,
 * 11.11.2026: «да, давай сделаем»). Тот же вид выключателя: {"on": true}.
 */
export const ISLAND_SHORT_KEY = "island_short";

/** Включено ли: сбой чтения — выключено (новичок просто идёт в мир). */
export const islandNewbiesOn = (): Promise<boolean> => islandSwitchOn(ISLAND_NEWBIES_KEY);

/** Выключатель острова в settings: {"on": true}; нет строки или сбой — выключено. */
export async function islandSwitchOn(key: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(key)} LIMIT 1;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ value: unknown }>;
  let v: unknown = rows?.[0]?.value ?? null;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return false;
    }
  }
  return !!v && typeof v === "object" && (v as { on?: unknown }).on === true;
}

/**
 * Новичок — на свой остров. Уже был остров (строка raid_island) — не трогаем.
 * Сбой — новичок остаётся в основном мире: начало игры важнее острова.
 */
export async function greetNewbie(account: string, wallet: string): Promise<boolean> {
  try {
    if (!(await islandNewbiesOn())) return false;
    const { loadIsland } = await import("./island-row");
    if (await loadIsland(account)) return false;
    const { enterIsland } = await import("./island-admin");
    await enterIsland(wallet, account);
    return true;
  } catch (e) {
    console.error("[island-newbie] остров новичку не создан:", account, e);
    return settleFailed(account);
  }
}

/**
 * Вход споткнулся. Герой уже на острове (упал хвост: рюкзак, бафф) — встретил,
 * true. Остров создан, а герой не встал — снести, чтобы не висел пустым; false.
 */
async function settleFailed(account: string): Promise<boolean> {
  try {
    const { isLive, loadIsland } = await import("./island-row");
    const row = await loadIsland(account);
    if (!isLive(row)) return false;
    const { positionOf } = await import("./island-move");
    if ((await positionOf(account))?.mapId === row.mapId) return true;
    const { dropIsland } = await import("./island-create");
    await dropIsland(row.mapId);
  } catch (e) {
    console.warn("[island-newbie] недосозданный остров не снесён:", account, e);
  }
  return false;
}
