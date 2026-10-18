// Модуль движения по карте бета-рейда
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { raidOwner } from "./owner";
import { playerMapId, ownCell, type Cell } from "./encounter-where";

// ─── Получить состояние игрока ───

export const getBetaRaidState = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = await requireBetaRaid();
  const account = await raidOwner(wallet);
  const { sb } = await import("../../db/pg");
  const { loadActiveEffects } = await import("./active-effects");
  const { loadHeroView } = await import("./hero-power");

  // Пять независимых вопросов — одной волной. Раньше они стояли в столбик, и
  // самый частый ответ рейда (его дёргают на каждый шаг и по таймеру) ждал
  // восемь сетевых рейсов подряд вместо двух.
  //
  // Позиция — только через ownCell: строка подключённого кошелька, та же, что
  // двигает ход и что проверяет гейт замка. Раньше здесь был свой SELECT без
  // ORDER BY, и на аккаунте с сёстрами фигурка вставала не туда, куда ходили.
  const [cell, energyResult, effects, view, mapId] = await Promise.all([
    ownCell(wallet),
    sb.rpc("compute_energy", { p_wallet: wallet }),
    // Значки над героем и надбавка к шагу — из ОДНОЙ выборки. Раньше здесь друг
    // за другом стояли slowExtraCost и loadActiveEffects, и самый частый запрос
    // рейда дважды ходил в базу за одними и теми же строками замедления; снимки
    // при этом могли разъехаться внутри одного ответа.
    loadActiveEffects(account),
    // Герой нужен и блоку замка, и виду фигурки на карте: грузим один раз.
    loadHeroView(wallet).catch(() => null),
    // Карта ИГРОКА (мультикарта): та, на которой он стоит. Пока все на активной —
    // вернёт её же. Не назначена — не повод падать, отдаём null.
    playerMapId(account).catch(() => null),
  ]);

  const energyData = (
    energyResult.data as Array<{ energy_now: number; max_energy: number }> | null
  )?.[0];

  // Вид фигурки на карте — по расе ВЫБРАННОГО героя. У кого герой уже загружен
  // (флаг hero_power открыт), тому за расой второй раз в базу ходить незачем;
  // остальным по-прежнему отдельный запрос.
  const { spriteForRace, heroSpriteFor } = await import("./hero-look");
  const heroSprite = view
    ? spriteForRace(view.info.race)
    : await heroSpriteFor(wallet).catch(() => null);

  let position: Cell | null = cell;
  if (!position && mapId) {
    // Позиции ещё нет — у замка (в главном мире — у ратуши Юпленда).
    const { startCell } = await import("./castle-door");
    position = await startCell(mapId).catch(() => null);
  }

  // Поле оставляем, хотя свежий клиент его не читает (он считает надбавку сам,
  // useSlowExtra по effects.slow.rows): состояние рейда лежит в персистентном
  // кэше, и у старого клиента после выката ответ без slowExtra занизил бы цену
  // шага — показано одно, списано другое. Число ровно то же, что отдавал
  // slowExtraCost: обе стороны зовут slowExtraOf по тем же строкам.
  const slowExtra = effects.slow?.value ?? 0;

  // Блок героя появляется, только пока флаг hero_power открыт (move-hero-state).
  const { heroMapState } = await import("./move-hero-state");
  // Отдаём именно прочитанную строку, а не подставной центр карты: гейт замка
  // на сервере тоже читает строку кошелька (ownCell). Если строки нет вовсе,
  // heroMapState сам закрепит стартовую клетку — тот же центр, что уехал
  // клиенту в position, — и клиент с сервером сойдутся на одном замке.
  const heroPatch = await heroMapState(wallet, cell, view, mapId);

  return {
    position,
    energy: energyData?.energy_now ?? 30,
    maxEnergy: energyData?.max_energy ?? 30,
    mapId: mapId ?? undefined,
    slowExtra,
    effects,
    heroSprite,
    ...heroPatch,
  };
});

// ─── Движение по карте ───

/**
 * Сам шаг живёт в move-step.ts: там он разложен по волнам запросов, и здесь
 * остались только гейт и разбор входа. Импорт динамический не ради красоты —
 * этот файл попадает в клиентский граф, а move-step тянет за собой pg.ts и
 * живой поток рейда (ПРАВИЛА: «серверный модуль утёк в клиент»).
 */
export const moveBetaRaid = createServerFn({ method: "POST" })
  // big — посадка только в БОЛЬШОЙ: дальше маршрут идёт океаном (routeFleet).
  .inputValidator((d: unknown) =>
    z.object({ q: z.number().int(), r: z.number().int(), big: z.boolean().optional() }).parse(d),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ data }): Promise<any> => {
    const wallet = await requireBetaRaid();
    const { performStep } = await import("./move-step");
    return performStep(wallet, data);
  });
