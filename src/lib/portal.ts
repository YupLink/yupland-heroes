// Портал: сеть переходов по карте и «дверь» — платный проход без переноса.
//
// Настройка живёт на КЛЕТКЕ (building_config.portal), а не в шаблоне: один и
// тот же облик стоит в разных концах карты и работает по-разному — где-то
// вход в подземку, где-то просто платная дверь.
//
// Группа — число. Порталы с одинаковым числом связаны в сеть: вошёл в любой —
// вышел в случайном другом из этой же сети. Ноль стоит особняком: это дверь,
// она берёт плату за проход и никуда не переносит.
//
// Имена групп админ придумывает сам и запоминает (общий словарь на все
// порталы) — цифра «3» через месяц не расскажет, что это была за сеть.
import type { MarketPriceResource } from "./marketItem";

/** Группа «дверь»: платный проход, без переноса. */
export const PORTAL_DOOR = 0;

/** Потолок уровня героя: выше него ограничение уже ничего не значит. */
export const MAX_HERO_LEVEL = 100;

/**
 * Одна строка цены. Все строки берутся вместе, а не на выбор.
 *
 * Кроме ресурсов платить можно ТОВАРОМ — тем, что продаётся в маркете и лежит
 * у героя в рюкзаке (зелья, кирпичи, наборы трав). Такой строке нужен ключ
 * стека рюкзака и имя для показа: по ключу списывают, имя видит игрок.
 */
export type PortalPrice = {
  resource: MarketPriceResource | "item";
  /** Символ монеты, когда платят токеном. */
  token?: string | null;
  /** Ключ стека рюкзака у строки-товара: «custom:tmpl_x». */
  itemKey?: string | null;
  /** Как товар называется — иначе в цене висел бы голый ключ. */
  itemName?: string | null;
  amount: number;
};

export type PortalConfig = {
  /** Номер сети (подтип). 0 — дверь. Сети СВОИ на каждом этаже (карте). */
  group: number;
  /**
   * Этаж назначения (id карты) для перехода МЕЖДУ мирами. Пусто/null — переход
   * внутри своей карты (как раньше). Задан — выходим в портал той же сети на
   * этой карте. Дверь (group 0) этажа не имеет.
   */
  targetMap: string | null;
  /**
   * Нижняя и верхняя границы уровня героя — КАЖДАЯ включается отдельно.
   * «Только от 5-го» и «только до 10-го» — разные правила, и одной галкой на
   * обе их было не задать.
   */
  levelFromOn: boolean;
  levelFrom: number;
  levelToOn: boolean;
  levelTo: number;
  /**
   * Порог по «пройденной» энергии: сколько игрок должен был потратить на шаги,
   * чтобы проход был открыт. 0 или галка снята — порога нет. Считает шаги
   * (move-energy-spent), не бои, не порталы, не посадку на корабль.
   */
  moveEnergyMinOn: boolean;
  moveEnergyMin: number;
  prices: PortalPrice[];
};

export const DEFAULT_PORTAL: PortalConfig = {
  group: PORTAL_DOOR,
  targetMap: null,
  levelFromOn: false,
  levelFrom: 1,
  levelToOn: false,
  levelTo: 100,
  moveEnergyMinOn: false,
  moveEnergyMin: 0,
  prices: [],
};

const RESOURCES: Array<MarketPriceResource | "item"> = [
  "item",
  "token",
  "energy",
  "likes",
  "tickets",
  "gold",
  "stone",
  "wood",
  "diamonds",
];

const isResource = (v: unknown): v is MarketPriceResource | "item" =>
  typeof v === "string" && (RESOURCES as string[]).includes(v);

/** Цена как её задал админ: мусор отбрасываем, нули оставляем редактору. */
function parsePrices(raw: unknown, keepEmpty: boolean): PortalPrice[] {
  if (!Array.isArray(raw)) return [];
  const out: PortalPrice[] = [];
  for (const item of raw) {
    const p = (item ?? {}) as Partial<PortalPrice>;
    const resource = isResource(p.resource) ? p.resource : "gold";
    const amount = Number(p.amount);
    if (!keepEmpty && !(Number.isFinite(amount) && amount > 0)) continue;
    out.push({
      resource,
      token: resource === "token" ? (p.token ?? null) : null,
      itemKey: resource === "item" ? (p.itemKey ?? null) : null,
      itemName: resource === "item" ? (p.itemName ?? null) : null,
      amount: Number.isFinite(amount) ? amount : 0,
    });
  }
  return out;
}

/**
 * Настройка портала этой клетки. `draft` — для редактора: там недозаполненная
 * строка цены обязана дожить до следующего нажатия, а не исчезнуть под пальцем.
 */
export function portalConfig(cellConfig: unknown, draft = false): PortalConfig {
  const raw = (cellConfig as { portal?: unknown } | null)?.portal as
    | (Partial<PortalConfig> & { levelOn?: boolean })
    | undefined;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PORTAL };
  const group = Math.max(0, Math.round(Number(raw.group) || 0));
  const from = Math.round(Number(raw.levelFrom));
  const to = Math.round(Number(raw.levelTo));
  const meMin = Math.max(0, Math.round(Number(raw.moveEnergyMin) || 0));
  // Порталы, настроенные до раздельных границ, несут одну общую галку levelOn
  // — читаем её как «включены обе».
  const legacy = raw.levelOn === true;
  // Этаж перехода: строка-id карты. Дверь (0) этажа не имеет — переносить
  // некуда. Пустая строка = свой этаж.
  const tm =
    typeof raw.targetMap === "string" && raw.targetMap.trim() ? raw.targetMap.trim() : null;
  return {
    group,
    targetMap: group === PORTAL_DOOR ? null : tm,
    levelFromOn: raw.levelFromOn ?? legacy,
    levelFrom: Number.isFinite(from) && from > 0 ? from : 1,
    levelToOn: raw.levelToOn ?? legacy,
    levelTo: Number.isFinite(to) && to > 0 ? to : 100,
    moveEnergyMinOn: raw.moveEnergyMinOn === true,
    moveEnergyMin: meMin,
    prices: parsePrices(raw.prices, draft),
  };
}

/** Дверь — это группа ноль: берёт плату и не переносит никуда. */
export const isDoor = (cfg: PortalConfig): boolean => cfg.group === PORTAL_DOOR;

/** Пускает ли портал героя такого уровня. Без героя — не пускает вовсе. */
/** Пропускает ли портал по счётчику пройденной энергии. */
export function moveEnergyFits(cfg: PortalConfig, spent: number): boolean {
  if (!cfg.moveEnergyMinOn || cfg.moveEnergyMin <= 0) return true;
  return spent >= cfg.moveEnergyMin;
}

export function heroLevelFits(cfg: PortalConfig, level: number | null): boolean {
  // Считаем по тому же правилу, что и подпись: галки, которые стоят на самых
  // краях (с первого, до сотого), ничего не отсекают — герой без надобности
  // здесь не нужен, иначе портал «1–100» гонял бы за героем на каждом шаге.
  if (levelRangeText(cfg) === null) return true;
  if (level == null) return false;
  if (cfg.levelFromOn && level < cfg.levelFrom) return false;
  if (cfg.levelToOn && level > cfg.levelTo) return false;
  return true;
}

/**
 * Как назвать ограничение уровня игроку: «5–10», «5+», «≤ 10» или null.
 *
 * Полный диапазон (с первого по сотый) никого не отсекает — о таком «условии»
 * игроку писать незачем, это шум в окне.
 */
export function levelRangeText(cfg: PortalConfig): string | null {
  const from = cfg.levelFromOn && cfg.levelFrom > 1 ? cfg.levelFrom : null;
  const to = cfg.levelToOn && cfg.levelTo < MAX_HERO_LEVEL ? cfg.levelTo : null;
  if (from !== null && to !== null) return `${from}–${to}`;
  if (from !== null) return `${from}+`;
  if (to !== null) return `≤ ${to}`;
  return null;
}

/**
 * Что помнит сеть, кроме имени: преднастройки, которые подставляются новому
 * порталу этой сети. Цену и уровни у конкретного портала потом можно
 * переписать — шаблон только заполняет форму.
 */
export type PortalGroup = {
  name: string;
  prices?: PortalPrice[];
  levelFromOn?: boolean;
  levelFrom?: number;
  levelToOn?: boolean;
  levelTo?: number;
  moveEnergyMinOn?: boolean;
  moveEnergyMin?: number;
};

/** Словарь сетей «номер → сеть», общий для всех порталов карты. */
export type PortalGroupNames = Record<string, PortalGroup>;

/** Как назвать группу в интерфейсе: имя из словаря либо «Сеть 3». */
export function groupLabel(group: number, names: PortalGroupNames, ru = true): string {
  const own = names[String(group)]?.name?.trim();
  if (own) return own;
  if (group === PORTAL_DOOR) return ru ? "Дверь" : "Door";
  return ru ? `Сеть ${group}` : `Network ${group}`;
}

/**
 * Настройка портала по шаблону сети: подставляем цену и уровни, которые у этой
 * сети уже задавали. Чего в шаблоне нет — остаётся как было у портала.
 */
export function applyGroupTemplate(cfg: PortalConfig, group: number, names: PortalGroupNames) {
  const tpl = names[String(group)];
  if (!tpl) return { ...cfg, group };
  return {
    ...cfg,
    group,
    prices: tpl.prices ? tpl.prices.map((p) => ({ ...p })) : cfg.prices,
    levelFromOn: tpl.levelFromOn ?? cfg.levelFromOn,
    levelFrom: tpl.levelFrom ?? cfg.levelFrom,
    levelToOn: tpl.levelToOn ?? cfg.levelToOn,
    levelTo: tpl.levelTo ?? cfg.levelTo,
    moveEnergyMinOn: tpl.moveEnergyMinOn ?? cfg.moveEnergyMinOn,
    moveEnergyMin: tpl.moveEnergyMin ?? cfg.moveEnergyMin,
  };
}

/** Следующий свободный номер сети: последний известный плюс один. */
export function nextGroupNumber(names: PortalGroupNames, used: number[] = []): number {
  const nums = [...Object.keys(names).map(Number), ...used, PORTAL_DOOR].filter((n) =>
    Number.isFinite(n),
  );
  return Math.max(...nums) + 1;
}
