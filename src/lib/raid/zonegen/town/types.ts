// Органический рост поселения — общий контракт модулей town/*.
//
// Владелец, 25.09.2026: «сделай разбор, как создаются города и как они
// выглядят, чтобы был АЛГОРИТМ, а не придуманный рандомный расстановочный
// паттерн». Кольцо/крест/кварталы были трафаретами. Здесь поселение растёт,
// как растут настоящие (полная спецификация с источниками —
// docs/town-generation-algorithm.json): центр → въезды → магистрали от
// въездов к площади → стоимость земли → службы по правилам соседства →
// улицы по требованию → жильё с плотностью, падающей от центра.
//
// Случайность задаёт только состав и ничьи; всё идёт от одного сида.
import type { ZoneCell } from "../recipe";
import type {
  BuildingOption,
  SettlementReport,
  TownKind,
  ZoneStructure,
} from "../settlement-types";

/** Роли в городе — по ним работает зонирование (где что стоит). */
export type TownRole =
  | "town_hall"
  | "temple"
  | "market"
  | "tavern"
  | "warehouse"
  | "shipyard"
  | "barracks"
  | "armory"
  | "forge"
  | "university"
  | "museum"
  | "arena"
  | "watchtower"
  | "chambers"
  | "house";

/** Форма выводится из ограничений, а не выбирается (классификация сельских форм). */
export type TownForm =
  | "camp"
  | "hamlet"
  | "street"
  | "round"
  | "green"
  | "cluster"
  | "town"
  | "port";

/** Постройка справочника глазами роста: роль + облики для темы. */
export type RoleOption = BuildingOption & { role: TownRole };

/** Что одна служба/дом хочет получить: роль и конкретный шаблон с обликом. */
export type TownPick = { role: TownRole; option: RoleOption; skinId: string | null };

/** Поля расстояний и маски — считаются один раз на поселение (шаг 0). */
export type TownFields = {
  /** Клетки, где вообще можно строить/класть улицу (зона ∩ свободно ∩ суша). */
  land: Set<string>;
  water: Set<string>;
  /** Дороги карты в зоне и в кольце вокруг — к ним тянутся въезды. */
  mapRoads: Set<string>;
  /** BFS-расстояния по 6 соседям: до края выделения, до воды, до дороги карты. */
  dEdge: Map<string, number>;
  dWater: Map<string, number>;
  dMapRoad: Map<string, number>;
};

/** Скелет: центр, площадь/луг, въезды, дороги с рангом. */
export type TownSkeleton = {
  form: TownForm;
  /** Радиус застройки Rb (по числу построек). */
  radius: number;
  center: ZoneCell;
  /** Площадь (слой дороги, без построек) или луг (пусто, без дороги). */
  plaza: ZoneCell[];
  green: ZoneCell[];
  gates: ZoneCell[];
  /** Ключ «q,r» → ранг: 1 магистраль, 0.5 улица, 0.25 переулок. */
  roads: Map<string, number>;
};

export type TownInput = {
  cells: ZoneCell[];
  /** Ключи занятых клеток (база + невыгруженная очередь). */
  occupied: Set<string>;
  /** Клетки воды зоны (по имени местности, как у кораблей). */
  water: Set<string>;
  /** Клетки с непроходимым декором. */
  decorBlocked: Set<string>;
  /** Дороги карты (уже лежащие) в зоне и на 6 клеток вокруг. */
  mapRoads: Set<string>;
  seed: number;
  /** Сколько построек хотим (3–40); форма и радиус выводятся из него. */
  buildings: number;
  /** Тема обликов; "" — жребий среди хорошо покрытых. */
  theme: string;
  /** Заказ шаблона (лагерь, хутор, деревня, городок, порт); нет — auto. */
  kind?: TownKind;
  /** Ратуша обязательна при любом размере (города мира: без неё город не живёт). */
  hall?: boolean;
  /** Хотя бы одна лавка (города мира: ратуша торгует только через лавки). */
  shop?: boolean;
  options: RoleOption[];
  /** Ручной состав (если автоподбор выключен): роль берётся из options. */
  manual: Array<{ buildingId: string; count: number; fill?: boolean }> | null;
  roadId: string | null;
  built: boolean;
  /** Местность клеток зоны («q,r» → id) — для меток местности построек. */
  terrainOf?: Map<string, string>;
};

export type TownResult = {
  structures: ZoneStructure[];
  report: SettlementReport;
  /** Для отладки/ASCII: скелет, по которому ставили. */
  skeleton: TownSkeleton | null;
  /** Кто где встал РОЛЬЮ (рынок-«двор» — дом): по ней проверяются правила зонирования. */
  placed: Array<{ q: number; r: number; role: TownRole }>;
};
