// Что герой даёт игроку НА КАРТЕ: скидку на шаг и признак замка.
//
// Вынесено из move.ts не ради красоты, а ради правила ≤250 строк: там остался
// сам ход, здесь — сборка блока для состояния рейда.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { HeroPowerView } from "./hero-power";
import { castleCell, cellAtCastle } from "./castle";
import { syncHeroEnergy } from "./hero-energy-sync";
import type { Cell } from "./encounter-where";

/**
 * Замок — место, где меняют героя и его снаряжение, поэтому клиент должен
 * знать, стоит ли игрок в нём и куда идти. Отряд там собирать МОЖНО, но не
 * обязательно: принуждение откатили, фишки снова выбирают в окне боя.
 */
export type HeroMapState = {
  /**
   * Скидка героя на шаг, в ПРОЦЕНТАХ по таблице heroPowerCurve.SPEED_DISCOUNT
   * (100 → 50, 200 → 75, 500 → 99), зажим HERO_STEP_DISCOUNT_MAX_PCT. Цену по
   * проценту считает shipRules.stepEnergyCost. Герою с нераспознанной расой —
   * 0: сервер списывает по loadHeroPower, а она такого героя не отдаёт.
   */
  stepDiscount: number;
  atCastle: boolean;
  castle: { q: number; r: number };
  squadSize: number;
  /**
   * Раса героя не нашлась в таблице статов: бонусы нулевые. Признак нужен
   * клиенту, чтобы объяснить нули (braid.castle_unknown_race), — иначе герой
   * выглядит просто сломанным.
   */
  unknownRace: boolean;
  /** Шкала сытости выбранного героя (lib/hero/satiety); на нуле — голод. */
  satiety?: { now: number; max: number; hungry: boolean };
};

/**
 * Первый вход: строки в beta_raid_positions ещё нет, а на карте игрок уже
 * нарисован в центре — то есть ровно на замке. Пока строки нет, гейт замка
 * читает ownCell, видит «не на карте» и отказывает — кнопка горит, замок не
 * пускает. Закрепляем стартовую клетку строкой, чтобы клиент и сервер
 * смотрели в одно место. DO NOTHING: чужой прогресс аккаунта не трогаем.
 */
async function claimStartCell(wallet: string, castle: Cell, mapId?: string | null): Promise<Cell> {
  const { raidOwner } = await import("./owner");
  // Замок стоит на ратуше (Юпленд) — встаём рядом: на постройке стоять нельзя.
  const { castleLanding } = await import("./castle-door");
  const at = mapId ? ((await castleLanding(mapId, castle).catch(() => null)) ?? castle) : castle;
  await mcpExec(
    `INSERT INTO yuplink.beta_raid_positions (account_id, q, r, updated_at, map_id)
     VALUES (${sqlStr(await raidOwner(wallet))}, ${at.q}, ${at.r}, now(),
             (SELECT (value::jsonb)->>'mapId' FROM yuplink.settings WHERE key = 'beta_raid_map'))
     ON CONFLICT (account_id) DO NOTHING;`,
    { wrapJson: false },
  );
  return at;
}

/**
 * Ничего не считаем, пока флаг hero_power закрыт: loadHeroView отдаёт null, и
 * в ответ не уходит ни одного лишнего поля — массовый игрок видит прежнюю карту
 * байт в байт, а база не получает ни одного лишнего запроса (стартовую клетку
 * мы тоже пишем только здесь, то есть только под флагом).
 *
 * Героя (loadHeroView, а не loadHeroPower: герой с нераспознанной расой на
 * карте остаётся, иначе ему негде было бы починиться — см. hero-power.ts) и
 * карту передаёт вызывающий: он же берёт из этого героя вид фигурки, и второй
 * загрузки на тот же ответ не нужно.
 */
export async function heroMapState(
  wallet: string,
  // Позицию передаёт вызывающий: состояние рейда опрашивают часто, и она у него
  // уже прочитана (ownCell). Свой SELECT здесь был бы третьим чтением той же
  // строки за один ответ — и мимо кэша размера карты ничего не спасало.
  pos: Cell | null,
  view: HeroPowerView | null,
  /** Уже известная активная карта; без неё castleCell спросит её сам. */
  mapId?: string | null,
): Promise<{ hero?: HeroMapState }> {
  if (!view) return {};
  const hero = view.info;
  const castle = await castleCell(mapId ?? undefined);
  const at = pos ?? (await claimStartCell(wallet, castle, mapId).catch(() => null));
  // Замок — только в главном мире: на другом этаже его центр — чужая земля.
  const { activeBetaMapId } = await import("./encounter-where");
  const main = !mapId || mapId === (await activeBetaMapId().catch(() => mapId));
  const atCastle = main && cellAtCastle(at, castle);
  // Интеллект героя живёт не здесь, а в колонках user_energy: их читают сами
  // SQL-функции энергии. Зовём не дожидаясь — максимум и скорость добычи
  // приедут со следующим опросом состояния, а ответ карты ждать записи не
  // обязан. Основные точки — смена героя, прокачка и артефакты; здесь ленивая
  // подстраховка на случай, если какую-то из них забыли позвать.
  void syncHeroEnergy(wallet, hero.field).catch(() => {});
  return {
    hero: {
      // Один источник со списанием (move-step, ship-ride → loadHeroPower).
      stepDiscount: view.unknownRace ? 0 : hero.field.stepDiscountPct,
      atCastle,
      castle,
      squadSize: hero.squad.length,
      unknownRace: view.unknownRace,
      satiety: hero.satiety,
    },
  };
}
