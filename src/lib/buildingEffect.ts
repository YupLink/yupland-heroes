// Что постройка даёт игроку, кроме смены облика.
//
// Общий модуль: сервер решает по нему, можно ли спустить корабль или осмотреть
// округу, а редактор построек показывает админу тот же выбор.
//
// Тиры постройки — просто картинки; смысл ей придаёт эффект. Верфь строит
// корабли, обзорная вышка открывает местность вокруг. Эффект выбирается в
// редакторе построек (meta.effect), но старые постройки заведены до этого
// поля — для них узнаём эффект по названию, чтобы «Верфь» и «Обзорная вышка»
// заработали без переделки.
//
// Типы (BuildingEffect/ServicePrice/BuildingExtra/MarketItemView/MineResource)
// живут в ./buildingEffect.types и ре-экспортятся отсюда — внешние импорты
// `@/lib/buildingEffect` менять не нужно.
import type { BuildingEffect, ServicePrice, PriceLabel } from "./buildingEffect.types";
import { starsForDarai } from "./starsForDarai";

export type {
  BuildingEffect,
  ServicePrice,
  PriceLabel,
  BuildingExtra,
  MarketItemView,
  MineResource,
} from "./buildingEffect.types";

/**
 * Цены дерева уровней: админ задаёт один или несколько вариантов, игрок
 * выбирает любой. Пусто — дерево ещё не настроено и не работает.
 */
export function treePrices(meta: unknown): ServicePrice[] {
  const raw = (meta as { levelPrices?: unknown } | null)?.levelPrices;
  if (!Array.isArray(raw)) return [];
  const out: ServicePrice[] = [];
  for (const item of raw) {
    const p = item as Partial<ServicePrice> | null;
    if (!p || typeof p !== "object") continue;
    // Суммы — целые: дробная энергия ушла бы в SQL-функцию с integer.
    const amount = Math.round(Number(p.amount));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const kind =
      p.kind === "likes" || p.kind === "token" || p.kind === "energy" ? p.kind : "tickets";
    out.push({ kind, token: kind === "token" ? (p.token ?? null) : null, amount });
  }
  return out;
}

/**
 * Цены как есть, вместе с недозаполненными строками — для редактора.
 * treePrices() отбрасывает нули, и свежая строка исчезала прямо под пальцем.
 */
export function treePricesDraft(config: unknown): ServicePrice[] {
  const raw = (config as { levelPrices?: unknown } | null)?.levelPrices;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const p = (item ?? {}) as Partial<ServicePrice>;
    const kind =
      p.kind === "likes" || p.kind === "token" || p.kind === "energy" ? p.kind : "tickets";
    return {
      kind,
      token: kind === "token" ? (p.token ?? null) : null,
      amount: Number(p.amount) || 0,
    };
  });
}

/**
 * Цены КОНКРЕТНОГО дерева: сначала настройки клетки, потом — шаблона.
 * Так одно и то же «Древо знания» стоит по-разному в разных местах карты.
 */
export function cellTreePrices(cellConfig: unknown, meta: unknown): ServicePrice[] {
  const own = treePrices(cellConfig);
  return own.length > 0 ? own : treePrices(meta);
}

/**
 * Человеческое имя ресурса — одинаковое в редакторе и в окне игрока.
 * Возвращает ключ перевода, а не готовую строку: раньше здесь была зашита
 * русская фраза, и английский игрок читал «100 билетов» посреди своего UI.
 */
export function priceLabel(p: ServicePrice): PriceLabel {
  if (p.kind === "likes") return { key: "braid.price_likes", params: { n: p.amount } };
  if (p.kind === "energy") return { key: "braid.price_energy", params: { n: p.amount } };
  if (p.kind === "token") {
    // Звездочнику без DARAI — в звёздах (lib/starsForDarai.ts; на сервере — всегда DARAI).
    const stars = p.token === "Darai" ? starsForDarai(p.amount) : null;
    if (stars != null) return { key: "braid.price_tokens", params: { n: stars, token: "★" } };
    return p.token
      ? { key: "braid.price_tokens", params: { n: p.amount, token: p.token } }
      : { key: "braid.price_tokens_any", params: { n: p.amount } };
  }
  return { key: "braid.price_tickets", params: { n: p.amount } };
}

const BY_NAME: Array<{ re: RegExp; effect: Exclude<BuildingEffect, null> }> = [
  { re: /верф|вервь|shipyard/i, effect: "shipyard" },
  { re: /вышк|обзорн|watchtower/i, effect: "watchtower" },
  { re: /дерев|древо|древ[оа]|tree/i, effect: "leveltree" },
  { re: /таблич|вывеск|указател|sign/i, effect: "sign" },
  { re: /шахт|рудник|mine/i, effect: "mine" },
  { re: /грядк|огород|поле|field/i, effect: "field" },
  { re: /склад|амбар|хранилищ|warehouse/i, effect: "warehouse" },
  { re: /маркет|рынок|базар|лавк|market/i, effect: "market" },
  { re: /портал|телепорт|врат|portal/i, effect: "portal" },
  { re: /университ|институт|академ|university/i, effect: "university" },
  { re: /музей|выставк|museum/i, effect: "museum" },
  { re: /казино|casino/i, effect: "casino" },
];

/**
 * Эффект КЛЕТКИ: сначала то, что назначили этой постройке на карте (режим
 * бога пишет `effect` в building_config), потом — шаблон.
 *
 * Так одна и та же «Площадка» на одной клетке может быть грядкой, а на другой
 * складом: раньше поведение задавалось только у шаблона и применялось сразу ко
 * всем его копиям.
 */
export function cellBuildingEffect(
  cellConfig: unknown,
  meta: unknown,
  name: string | null,
): BuildingEffect {
  const raw = (cellConfig as { effect?: unknown } | null)?.effect;
  if (typeof raw === "string" && raw) {
    const own = buildingEffect({ effect: raw }, name);
    if (own) return own;
  }
  return buildingEffect(meta, name);
}

/** Эффект постройки: явный из meta, иначе — угаданный по названию. */
export function buildingEffect(meta: unknown, name: string | null): BuildingEffect {
  const obj = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  const raw = obj?.effect;
  if (
    raw === "shipyard" ||
    raw === "watchtower" ||
    raw === "leveltree" ||
    raw === "sign" ||
    raw === "mine" ||
    raw === "field" ||
    raw === "warehouse" ||
    raw === "market" ||
    raw === "portal" ||
    raw === "university" ||
    raw === "museum" ||
    // Таверны в BY_NAME нет намеренно: на карте уже стоят постройки с именем
    // «Таверна», и угадывание молча выдало бы им платную смену героя.
    raw === "tavern" ||
    // Алтарь-буст тоже НЕ угадываем по имени: «Алтарь» на карте уже стоит как
    // украшение, и молча раздавать с него бонусы никто не просил.
    raw === "boost" ||
    // Столб заклинаний по имени НЕ угадываем: «Столб»/«Обелиск» на карте —
    // это украшение, и молча включённая на нём платная школа магии была бы
    // сюрпризом и для админа, и для игрока.
    raw === "spellbook" ||
    // Ратушу тоже НЕ угадываем по имени: постройка с любым названием получит
    // роль ратуши ТОЛЬКО когда админ выбрал её эффектом. Иначе на карте могла
    // бы завестись «ратуша» из старого шаблона и молча забрать себе зону.
    raw === "town_hall" ||
    // Покои по имени НЕ угадываем: «спальня»/«домик»/«отель» — украшения на
    // карте, и молча включённый на них платный съём эффектов был бы сюрпризом.
    raw === "chambers" ||
    // «Забвение» тоже только явным выбором: «Храм» на карте — украшение.
    raw === "oblivion" ||
    // Турнир по имени НЕ угадываем: админ сам ставит его на любую постройку.
    raw === "tournament" ||
    raw === "casino"
  ) {
    return raw;
  }
  // Поле есть, но пустое — админ сознательно выбрал «ничего», имя не смотрим.
  if (obj && "effect" in obj) return null;
  for (const { re, effect } of BY_NAME) if (re.test(name ?? "")) return effect;
  return null;
}

/**
 * Постройка работает только достроенной: пока верфь «непостроенная», кораблей
 * с неё не спустить. Достроенная — та, у которой следующего тира уже нет.
 */
export function isBuilt(tier: number, tiersCount: number): boolean {
  return tiersCount > 0 && tier >= tiersCount - 1;
}

/** Радиус обзора вышки в клетках — открывает соты вокруг себя. */
export const TOWER_RADIUS = 5;

/** Сколько энергии стоит разведка с вышки. */
export const TOWER_ENERGY = 1;

/** Постройка корабля: обычному герою и герою-строителю. */
export const SHIP_PRICE_LIKES = 500;
export const SHIP_PRICE_LIKES_BUILDER = 50;

/** Специализация, которой верфь делает скидку. */
export const BUILDER_SPEC = "Строитель";

/** Цена корабля для конкретного героя: строителю верфь спускает судно почти даром. */
export function shipPriceFor(spec: string | null): number {
  return spec === BUILDER_SPEC ? SHIP_PRICE_LIKES_BUILDER : SHIP_PRICE_LIKES;
}

/** Текст таблички живёт в настройках КЛЕТКИ: у каждой своё послание. */
export function signText(cellConfig: unknown): string {
  const raw = (cellConfig as { text?: unknown } | null)?.text;
  return typeof raw === "string" ? raw : "";
}

/**
 * Цены покоев: как у leveltree. Пусто — постройка не настроена, отдыхать не
 * получится (окно скажет «покои закрыты»). Ключ хранения — `chambersPrices`.
 */
export function chambersPrices(meta: unknown): ServicePrice[] {
  const raw = (meta as { chambersPrices?: unknown } | null)?.chambersPrices;
  if (!Array.isArray(raw)) return [];
  const out: ServicePrice[] = [];
  for (const item of raw) {
    const p = item as Partial<ServicePrice> | null;
    if (!p || typeof p !== "object") continue;
    const amount = Math.round(Number(p.amount));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const kind =
      p.kind === "likes" || p.kind === "token" || p.kind === "energy" ? p.kind : "tickets";
    out.push({ kind, token: kind === "token" ? (p.token ?? null) : null, amount });
  }
  return out;
}

/** Черновик для редактора — с нулевыми/пустыми строками. */
export function chambersPricesDraft(config: unknown): ServicePrice[] {
  const raw = (config as { chambersPrices?: unknown } | null)?.chambersPrices;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const p = (item ?? {}) as Partial<ServicePrice>;
    const kind =
      p.kind === "likes" || p.kind === "token" || p.kind === "energy" ? p.kind : "tickets";
    return {
      kind,
      token: kind === "token" ? (p.token ?? null) : null,
      amount: Number(p.amount) || 0,
    };
  });
}

/** Клетка сначала, шаблон в запас — как у leveltree. */
export function cellChambersPrices(cellConfig: unknown, meta: unknown): ServicePrice[] {
  const own = chambersPrices(cellConfig);
  return own.length > 0 ? own : chambersPrices(meta);
}
