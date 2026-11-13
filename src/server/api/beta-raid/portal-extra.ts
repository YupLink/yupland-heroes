// Что окно постройки показывает у портала: цена прохода, требование к герою и
// сколько выходов у сети.
//
// Куда именно выведет — не говорим: сеть может тянуться в неразведанные земли,
// и список выходов был бы бесплатной картой. Игрок видит только число выходов.
import { portalExits, roomOf } from "./portal-exits";
import { roomNames } from "./portal-rooms";
import { groupLabel, heroLevelFits, isDoor, levelRangeText, portalConfig } from "@/lib/portal";
import type { BuildingExtra } from "@/lib/buildingEffect";
import { isIslandMapId } from "@/lib/raid/island/ids";

export async function portalExtra(opts: {
  built: boolean;
  mapId: string;
  q: number;
  r: number;
  cellConfig?: unknown;
  heroLevel: number | null;
  /** Игрок уже стоит на этой клетке — двери ему делать нечего. */
  standingHere: boolean;
  /** Портал острова: ачивки не готовы — сколько из 8 готово (§8.57); null — пускает. */
  gateDone?: number | null;
  /** Демо-остров (demo-island): ни к чему не прикреплён — выходов нет. */
  demo?: boolean;
}): Promise<BuildingExtra> {
  const cfg = portalConfig(opts.cellConfig);
  // Комната — на этаже назначения (пусто — на своём): имя и выходы оттуда.
  const room = roomOf(cfg, opts.mapId);
  const names = await roomNames(room.mapId).catch(() => ({}));
  const door = isDoor(cfg);
  // Портал острова новичка — один выход, в основной мир, без сети (island-exit).
  const island = isIslandMapId(opts.mapId);
  const exits =
    door || island ? [] : await portalExits(room, { mapId: opts.mapId, q: opts.q, r: opts.r });
  const exitCount = opts.demo ? 0 : island ? 1 : exits.length;
  const levelOk = heroLevelFits(cfg, opts.heroLevel);

  // Причины отказа перечислены сверху вниз по важности: недостроенный портал
  // не спасёт ни уровень героя, ни второй выход.
  // У двери кнопка делает обычный ШАГ на её клетку — плату берёт сам шаг, и
  // второго списания быть не может. Поэтому «нет второго портала» её не
  // касается: дверь никуда и не ведёт.
  const gated = island && !opts.demo && opts.gateDone != null;
  const reasonKey = !opts.built
    ? "braid.portal_unfinished"
    : gated
      ? "island.portal_gate"
      : !levelOk
      ? "braid.portal_level"
      : // Дверь под ногами уже пройдена: платить второй раз не за что.
        door && opts.standingHere
        ? "braid.gate_passed"
        : !door && exitCount === 0
          ? "braid.portal_alone"
          : null;

  return {
    kind: "portal",
    group: cfg.group,
    groupName: groupLabel(cfg.group, names),
    prices: cfg.prices,
    level: levelRangeText(cfg),
    exits: exitCount,
    can: reasonKey === null,
    reasonKey,
    reasonParams: { range: levelRangeText(cfg) ?? "", n: opts.gateDone ?? 0 },
    island,
  };
}
