// Артефакт по словам (§8.81, владелец 28.10.2026: «арты создаются по словам или
// рандомно — напишу наручи, делает наручи, или вообще рандом»). Из слов берём:
// какой предмет (наручи → наручи), чего хочется (раса, специализация,
// местность, характеристика — «хочу на ассасина» тянет специализацию к
// ассасину) и сам текст — как описание вида для нейросети. Пусто — всё рандом.
import type { CraftBoost } from "./craftRoll";
import type { CraftLand, CraftRace, CraftSpec, CraftStat } from "./craftTable";

export const WORDS_MAX = 120;

/** Начала слов (ru/en) → значение (как слово сравнивается с основой — fits). */
type Stems<T> = ReadonlyArray<readonly [T, readonly string[]]>;

const FORMS: Stems<string> = [
  ["bracers", ["наруч", "браслет", "bracer", "bracelet", "vambrace"]],
  ["gloves", ["перчат", "рукавиц", "glove", "gauntlet"]],
  ["ring", ["кольц", "перстен", "перстн", "ring$", "rings$"]],
  ["helmet", ["шлем", "helm"]],
  ["crown", ["корон", "диадем", "crown", "tiara"]],
  ["hood", ["капюшон", "hood"]],
  ["hat", ["шляп", "колпак", "hat$", "hats$"]],
  ["amulet", ["амулет", "оберег", "amulet"]],
  ["necklace", ["ожерел", "бусы", "necklace"]],
  ["pendant", ["кулон", "медальон", "pendant", "medallion", "locket"]],
  [
    "armor",
    [
      "доспех",
      "кирас",
      "кольчуг",
      "латы",
      "нагрудник",
      "armor",
      "armour",
      "breastplate",
      "chainmail",
    ],
  ],
  ["robe", ["мантия", "мантию", "роба", "ряса", "robe"]],
  ["cloak", ["плащ", "накидк", "cloak", "cape"]],
  ["sword", ["меч", "клинок", "сабл", "катан", "sword", "blade", "saber", "katana"]],
  ["axe", ["топор", "секир", "axe"]],
  ["staff", ["посох", "жезл", "staff", "wand"]],
  ["mace", ["булав", "палиц", "молот", "mace", "hammer"]],
  ["spear", ["копь", "копье", "пика", "алебард", "spear", "lance", "halberd"]],
  ["shield", ["щит", "shield"]],
  ["dagger", ["кинжал", "нож", "dagger", "knife"]],
  ["tome", ["книг", "гримуар", "фолиант", "book", "tome", "grimoire"]],
  ["lantern", ["фонар", "лампа", "lantern", "lamp"]],
  ["boots", ["сапог", "сапож", "ботин", "обувь", "boot", "shoe"]],
  ["greaves", ["понож", "greave"]],
  ["talisman", ["талисман", "руна", "charm", "talisman", "rune"]],
  ["figurine", ["статуэт", "фигурк", "идол", "figurine", "idol", "statue"]],
  ["pouch", ["мешоч", "кошел", "сумк", "pouch", "purse"]],
  ["familiar", ["фамильяр", "питомец", "зверек", "familiar", "pet$", "pets$"]],
];

// ДраКошка — раньше Дракона: «дракошка» начинается с «дракон»-подобного.
const RACES: Stems<CraftRace> = [
  ["ДраКошка", ["дракош", "драконокош", "dracat", "dragoncat"]],
  ["Пчела", ["пчел", "bee$", "bees$"]],
  ["Кабан", ["кабан", "вепр", "boar"]],
  ["Юпик", ["юпик", "yupik"]],
  ["Единорог", ["единорог", "unicorn"]],
  ["Дракон", ["дракон", "dragon"]],
];

const SPECS: Stems<CraftSpec> = [
  ["Ассасин", ["ассасин", "асасин", "убийц", "assassin", "rogue"]],
  ["Торговец", ["торговец", "торговца", "купец", "купца", "merchant"]],
  ["Путешественник", ["путешеств", "странник", "traveler", "traveller", "wanderer"]],
  ["Строитель", ["строител", "builder"]],
  ["Воин", ["воин", "рыцар", "warrior", "knight"]],
  ["Маг", ["маг", "колдун", "чародей", "волшебн", "mage", "wizard", "sorcer"]],
];

// Сначала составные: «магический лес» — местность, а не специализация «маг».
const LAND_PHRASES: Stems<CraftLand> = [
  ["Адские земли", ["адские земли", "hell lands"]],
  ["Зимний лес", ["зимний лес", "winter forest"]],
  ["Сказочный лес", ["сказочный лес", "fairytale forest", "fairy forest"]],
  ["Магический лес", ["магический лес", "magic forest"]],
  ["Безумный мир", ["безумный мир", "mad world"]],
  ["Земля удачи", ["земля удачи", "land of luck"]],
  ["Земли юпиков", ["земли юпиков", "yupik lands"]],
];

const LANDS: Stems<CraftLand> = [
  ["Адские земли", ["адск", "hell$"]],
  ["Горы", ["горы", "горн", "гора", "mountain"]],
  ["Болото", ["болот", "swamp"]],
  ["Пустыня", ["пустын", "desert"]],
  ["Небеса", ["небес", "heaven"]],
  ["Порт", ["порт$", "порту$", "порта$", "port$"]],
  ["Лес", ["лес$", "лесн", "леса", "forest"]],
];

const STATS: Stems<CraftStat> = [
  ["Attack", ["атак", "урон", "attack", "damage"]],
  ["Armor", ["броня", "брони", "броню", "защит", "defen"]],
  ["Intellect", ["интеллект", "мудр", "intellect", "wisdom"]],
  ["Speed", ["скорост", "быстр", "speed"]],
  ["Health", ["здоров", "жизн", "health"]],
  ["Luck", ["удач", "везен", "luck"]],
  ["Trade", ["торговл", "trade"]],
  ["Alchemy", ["алхими", "alchemy"]],
];

const tokens = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);

/** Слово подходит под основу: начинается с неё; основа с «$» — слово целиком. */
const fits = (w: string, stem: string) =>
  stem.endsWith("$") ? w === stem.slice(0, -1) : w.startsWith(stem);

/** 18+ и прочее недопустимое (картинку увидят другие): непристойное, мат,
 *  нацистское. Такие слова не в счёт — артефакт выходит полным рандомом. */
const BLOCKED: readonly string[] = [
  "порн",
  "секс",
  "эрот",
  "обнаж",
  "голая",
  "голый",
  "голые",
  "сиськ",
  "жоп",
  "шлюх",
  "елд",
  "хуй",
  "хуе",
  "хуё",
  "пизд",
  "ебат",
  "ебан",
  "ебл",
  "ебу",
  "бляд",
  "залуп",
  "пенис",
  "вагин",
  "вульв",
  "сперм",
  "член$",
  "члены$",
  "хер$",
  "херу$",
  "гитлер",
  "свастик",
  "наци$",
  "нацист",
  "nsfw",
  "porn",
  "sex",
  "nude",
  "naked",
  "fuck",
  "penis",
  "dick",
  "cock",
  "pussy",
  "vagina",
  "boob",
  "tits$",
  "cum$",
  "hitler",
  "swastika",
  "nazi",
];

/**
 * Слова → чистый текст: только буквы, цифры, пробел и простая пунктуация,
 * не длиннее WORDS_MAX. null — недопустимое содержание.
 */
export function cleanWords(raw: string): string | null {
  const text = raw
    .normalize("NFC")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "Е")
    .replace(/[^\p{L}\p{N} ,.'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, WORDS_MAX)
    .trim();
  return tokens(text).some((w) => BLOCKED.some((b) => fits(w, b))) ? null : text;
}

export type WordWish = { form: string | null; boost: CraftBoost };

function first<T>(words: string[], list: Stems<T>): T | undefined {
  for (const [value, stems] of list) {
    if (words.some((w) => stems.some((s) => fits(w, s)))) return value;
  }
  return undefined;
}

/** Что просили словами: предмет (null — не назван, выберет рандом) и желания. */
export function readWords(text: string): WordWish {
  const lower = text.toLowerCase();
  const words = tokens(text);
  const phrase = LAND_PHRASES.find(([, ps]) => ps.some((p) => lower.includes(p)))?.[0];
  // «Маг» не ловим внутри «магического леса» — это местность.
  const spec = phrase === "Магический лес" ? undefined : first(words, SPECS);
  const boost: CraftBoost = {
    race: first(words, RACES),
    spec,
    land: phrase ?? first(words, LANDS),
    stat: first(words, STATS),
  };
  for (const k of Object.keys(boost) as Array<keyof CraftBoost>) if (!boost[k]) delete boost[k];
  return { form: first(words, FORMS) ?? null, boost };
}

/** Пустые для картинки слова: желание, а не вид. */
const FILLER = new Set([
  "хочу",
  "хотим",
  "хотел",
  "героя",
  "герой",
  "героев",
  "мне",
  "нам",
  "чтобы",
  "сделай",
  "сделать",
  "нужен",
  "нужна",
  "нужно",
  "нужны",
  "пожалуйста",
  "артефакт",
  "артефакта",
  "арт",
  "арта",
  "предмет",
  "вещь",
  "i",
  "want",
  "for",
  "a",
  "an",
  "the",
  "hero",
  "please",
  "make",
  "artifact",
  "item",
]);

const ALL_STEMS = [FORMS, RACES, SPECS, LANDS, STATS].flatMap((list) => list.flatMap(([, x]) => x));

/**
 * Вид словами игрока для картинки: без «хочу на героя» и без того, что уже
 * учтено (предмет, раса, специализация, местность, характеристика — у них свои
 * мотивы в запросе). «хочу на быстрого единорога мага с золотым рогом» →
 * «с золотым рогом». Осталось только служебное — пусто.
 */
export function lookWords(text: string): string {
  const kept = text
    .split(/\s+/)
    .filter((raw) => {
      const w = raw.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      return w && !FILLER.has(w) && !ALL_STEMS.some((x) => fits(w, x));
    })
    .join(" ")
    // «хочу на …», «для …»: предлог от снятого желания в начале не нужен.
    .replace(/^(?:(?:на|для|for)\s+)+/i, "")
    .replace(/^[\s,.'-]+|[\s,.'-]+$/g, "");
  return kept.split(" ").some((w) => w.length > 2) ? kept.slice(0, 60).trim() : "";
}
