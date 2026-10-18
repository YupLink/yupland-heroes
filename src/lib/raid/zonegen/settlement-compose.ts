// Состав поселения: что и сколько стоит в лагере, деревне, городке и порту.
//
// Владелец, 22.09.2026: «что означает 40 и что означает 2, почему выбирается
// так много». Вес жребия и потолок — язык рулетки, а не города: в деревне
// ратуша одна, таверна одна, склад один, а остальное — дворы. Поэтому пресет
// набирает состав по РОЛЯМ, а не по id: шаблоны на живой карте заводят и
// переименовывают, роль «склад» от этого никуда не девается.
//
// Подбор чистый: ни БД, ни Math.random. На входе живой справочник, на выходе —
// строки состава, которые админ дальше правит руками.
import type {
  BuildingOption,
  SettlementPreset,
  SettlementSlot,
} from "@/lib/raid/zonegen/settlement-types";

/**
 * Восемь шаблонов на карте заведены без meta.effect (две «Ратуши», «Храм»,
 * «Арена», «Кузница», «Лавка», «Ломбард», «Плавильня»), и роль у них видна
 * только по имени. Гадаем ТОЛЬКО здесь, в подборе состава: ратушу в центр
 * генератор по-прежнему определяет по effect, поэтому «Ратуша»-декорация
 * останется обычным двором.
 */
const NAME_ROLE: Record<string, string> = {
  ратуша: "town_hall",
  храм: "boost",
  арена: "arena",
  кузница: "forge",
  плавильня: "smelter",
  ломбард: "pawnshop",
  лавка: "shop",
};

/** Роль постройки: эффект, а у без-эффектных — догадка по имени. */
export function roleOfOption(option: BuildingOption): string {
  const effect = option.effect === null ? "" : option.effect.trim();
  if (effect !== "") return effect;
  return NAME_ROLE[option.name.trim().toLowerCase()] ?? "none";
}

/**
 * Порядок важности. По нему планировщик ставит обязательные постройки: чем
 * выше в списке, тем ближе к центру. Ратуша — сердце, за ней уникальные
 * службы, дальше без-эффектные мастерские; market и незнакомые роли — в хвост.
 */
export const ROLE_ORDER: readonly string[] = [
  "town_hall",
  "tavern",
  "warehouse",
  "university",
  "museum",
  "chambers",
  "spellbook",
  "watchtower",
  "shipyard",
  "boost",
  "forge",
  "smelter",
  "pawnshop",
  "arena",
  "shop",
];

/** Сколько РАЗНЫХ дворов берём в фон: восьми хватает, чтобы улица не рябила. */
const MAX_FILL = 8;

/** Порт живёт с воды: эти рынки в нём уместнее прочих двадцати. */
const PORT_MARKET = ["путешественника", "продуктовый"];

type Wanted = { role: string; count: number };

/**
 * Состав пресетов — ролями, по одной штуке на службу. Лагерь без ратуши: это
 * стоянка, а не город, и ратуша ей ни к чему.
 */
const PRESET_ROLES: Record<SettlementPreset, Wanted[]> = {
  camp: [{ role: "tavern", count: 1 }],
  village: [
    { role: "town_hall", count: 1 },
    { role: "tavern", count: 1 },
    { role: "warehouse", count: 1 },
    { role: "forge", count: 1 },
  ],
  town: [
    { role: "town_hall", count: 1 },
    { role: "tavern", count: 1 },
    { role: "warehouse", count: 1 },
    { role: "university", count: 1 },
    { role: "museum", count: 1 },
    { role: "boost", count: 1 },
    { role: "arena", count: 1 },
    { role: "pawnshop", count: 1 },
    { role: "forge", count: 1 },
    { role: "smelter", count: 1 },
    { role: "chambers", count: 1 },
    { role: "spellbook", count: 1 },
    { role: "watchtower", count: 1 },
  ],
  port: [
    { role: "shipyard", count: 1 },
    { role: "warehouse", count: 2 },
    { role: "tavern", count: 1 },
  ],
};

/** Один и тот же справочник — один и тот же состав: сортируем по имени и id. */
const byNameId = (a: BuildingOption, b: BuildingOption): number => {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
};

/**
 * Кандидат на роль. Шаблон с настоящим эффектом всегда бьёт угаданного по
 * имени: «Ратуша» с meta.effect — ратуша, «Ратуша» без него — просто домик.
 * Дальше берём «главный» шаблон роли — тот, у кого больше тиров: у Таверны их
 * три, у Бара ни одного, и деревне нужна таверна. Ничьи решает имя.
 */
function pickRole(
  list: BuildingOption[],
  role: string,
  taken: Set<string>,
): BuildingOption | undefined {
  const same = list
    .filter((o) => !taken.has(o.id) && roleOfOption(o) === role)
    .sort((a, b) => Number(b.effect !== null) - Number(a.effect !== null) || b.tiers - a.tiers);
  return same.length > 0 ? same[0] : undefined;
}

/** Свободные рынки справочника — из них состоят дворы и лавки города. */
const markets = (list: BuildingOption[], taken: Set<string>): BuildingOption[] =>
  list.filter((o) => !taken.has(o.id) && o.effect === "market");

/**
 * Восемь дворов на фон — ровным шагом по всему списку, а не первые по алфавиту.
 * Рынков на живой карте 22, и «первые восемь» значило бы, что в каждом городе
 * стоят одни и те же Бездонный колодец с Драконьим магазином, а Пекарня с
 * Пилорамой не встанут нигде. Шаг считается от длины списка, поэтому выбор
 * по-прежнему один и тот же при одном и том же справочнике.
 */
function spread(list: BuildingOption[], take: number): BuildingOption[] {
  const n = Math.min(take, list.length);
  return Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]);
}

/** Рынок для порта: сперва «Путешественника», потом «Продуктовый». */
function pickPortMarket(list: BuildingOption[], taken: Set<string>): BuildingOption | undefined {
  for (const want of PORT_MARKET) {
    const hit = markets(list, taken).find((o) => o.name.toLowerCase().includes(want));
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * Собрать состав пресета из живого справочника. Чего в справочнике нет — того
 * в составе не будет (состав не падает, просто короче): роли ищутся по факту,
 * а не по заранее вбитым id.
 *
 * Постройки, которым нужен свой building_config (шахта, поле, портал, дерево
 * уровней, табличка), не берём никогда: в городе они встанут «не настроенными»
 * и работать не будут (ПРАВИЛА §8.14).
 */
export function composeSettlement(
  preset: SettlementPreset,
  options: BuildingOption[],
): SettlementSlot[] {
  const usable = options.filter((o) => !o.needsConfig).sort(byNameId);
  const taken = new Set<string>();
  const slots: SettlementSlot[] = [];
  const add = (option: BuildingOption | undefined, count: number): void => {
    if (option === undefined) return;
    taken.add(option.id);
    slots.push({ buildingId: option.id, count });
  };
  for (const want of PRESET_ROLES[preset]) add(pickRole(usable, want.role, taken), want.count);
  if (preset === "port") add(pickPortMarket(usable, taken), 1);
  // Фон: count 0 + fill — «этим добивать остаток пятна». Именно он делает
  // поселение поселением, а не выставкой по одной штуке каждой твари.
  for (const o of spread(markets(usable, taken), MAX_FILL)) {
    slots.push({ buildingId: o.id, count: 0, fill: true });
  }
  return slots;
}
