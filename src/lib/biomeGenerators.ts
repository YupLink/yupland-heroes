// Биом-генераторы для гекс-редактора. Чистые функции: получают выделение
// клеток и справочники ассетов — отдают Map с патчами (terrain/decoration/
// road) по каждому ключу. НИЧЕГО не пишут в state, БД или сеть: результат
// уходит в preview-буфер редактора, применяется вручную кнопкой.
//
// Подбор ассетов — RU-fuzzy по имени (у владельцев в БД лежат «Вода»,
// «Песок», «Трава», «Лес», а не жёсткие id). Не нашлось — берём первый
// ассет как fallback, чтобы генератор не молчал на пустой карте.
//
// Каждый вызов «Сгенерировать»/«Перегенерировать» использует Math.random —
// два подряд запуска дадут разные варианты (это то, что ждёт админ от
// кнопки «перегенерировать»).

export type BiomeType = "island" | "forest" | "desert" | "plain" | "custom";

export type Terrain = { id: string; name: string; meta?: unknown };
export type Decoration = { id: string; name: string };
export type Cell = { q: number; r: number };
/**
 * Патч, который применяется поверх текущей клетки при «Применить». Поля
 * необязательные: undefined — «не трогать это свойство», null — «стереть
 * это свойство» (например, убрать декор с клетки).
 */
export type Patch = {
  terrainId?: string | null;
  decorationId?: string | null;
  roadId?: string | null;
};

/** Ключ клетки — совпадает с `key(q, r)` из hexShared (без импорта, чтобы модуль был pure). */
const cellKey = (c: Cell) => `${c.q},${c.r}`;

/** Соседи-6 в axial-координатах. Дублируем из hexShared, чтобы модуль остался pure. */
const NEIGHBORS: Cell[] = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 },
];

const containsAny = (name: string, needles: string[]): boolean => {
  const n = name.toLowerCase();
  return needles.some((x) => n.includes(x));
};

const findTerrain = (terrains: Terrain[], needles: string[]): Terrain | null =>
  terrains.find((t) => containsAny(t.name, needles)) ?? null;

/** Все декорации, подходящие под слова, — пул целиком, а не первое совпадение. */
const pickDecorations = (decorations: Decoration[], needles: string[]): Decoration[] =>
  decorations.filter((d) => containsAny(d.name, needles));

/**
 * Деревья — по НАЧАЛУ слова: короткие корни «ель»/«дуб» подстрокой ловили бы
 * «мель», «капель» и «дубину», а «дерев» — «деревню». `\b` кириллицу не знает,
 * граница слова — начало строки или не-буква.
 */
const TREE_RE = /(^|[^а-яё])(дерев(?!н)|ель|ёлк|елк|сосн|дуб(?!ин)|берёз|берез)/i;
const pickTrees = (decorations: Decoration[]): Decoration[] =>
  decorations.filter((d) => TREE_RE.test(d.name.toLowerCase()));

/** Жребий из пула на каждую клетку; пустой пул → null. */
const rollFrom = (pool: Decoration[]): string | null =>
  pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)].id : null;

/**
 * «Внутренние» клетки выделения: те, у которых ВСЕ 6 соседей тоже в выделении.
 * Используется в биоме «Остров» — отделить сушу от кромки.
 */
function interiorSet(cells: Cell[]): Set<string> {
  const inSet = new Set(cells.map(cellKey));
  const interior = new Set<string>();
  for (const c of cells) {
    const allIn = NEIGHBORS.every((d) => inSet.has(`${c.q + d.q},${c.r + d.r}`));
    if (allIn) interior.add(cellKey(c));
  }
  return interior;
}

/**
 * Клетки-«пляж»: те, что в interior, но хотя бы один сосед — граничная клетка
 * выделения (в выделении, но не в interior). Один слой суши сразу от воды.
 */
function beachLayer(cells: Cell[], interior: Set<string>, inSet: Set<string>): Set<string> {
  const beach = new Set<string>();
  for (const c of cells) {
    const k = cellKey(c);
    if (!interior.has(k)) continue;
    const touchesBorder = NEIGHBORS.some((d) => {
      const nk = `${c.q + d.q},${c.r + d.r}`;
      return inSet.has(nk) && !interior.has(nk);
    });
    if (touchesBorder) beach.add(k);
  }
  return beach;
}

/** Идентификатор ассета или null, если справочник пустой. */
const idOrNull = (a: { id: string } | null): string | null => (a ? a.id : null);

export function generateBiome(
  biome: BiomeType,
  cells: Cell[],
  assets: { terrains: Terrain[]; decorations: Decoration[] },
  opts?: { customTerrainId?: string },
): Map<string, Patch> {
  const out = new Map<string, Patch>();
  if (cells.length === 0) return out;

  const { terrains, decorations } = assets;
  const fallbackTerrain: Terrain | null = terrains[0] ?? null;

  // RU-fuzzy подбор основных terrain-ассетов. Пустой справочник → fallback
  // (первый ассет), чтобы «Применить» не оставлял terrainId = null и не
  // делал клетку невидимой преградой (сервер такие клетки не сохраняет).
  const water = findTerrain(terrains, ["вод", "море", "океан"]) ?? fallbackTerrain;
  const sand = findTerrain(terrains, ["песок", "пляж", "берег"]) ?? fallbackTerrain;
  const grass = findTerrain(terrains, ["трав", "поле", "равнин"]) ?? fallbackTerrain;
  const forestT = findTerrain(terrains, ["лес", "чащ"]) ?? fallbackTerrain;
  const desertT = findTerrain(terrains, ["пустын"]) ?? sand;
  // mountain/gora пока не размещаем автоматически — оставлено на будущее,
  // но пусть будет найдено для расширения.
  // const mountain = findTerrain(terrains, ["гор", "скал"]) ?? fallbackTerrain;

  // Декорации — ПУЛАМИ: раньше бралось первое «дерев…» из справочника, и весь
  // лес выходил из одного клона. Теперь в каждой клетке жребий по всем
  // деревьям; нет деревьев — идут кусты. «Равнина» мешает оба пула.
  const shrubs = pickDecorations(decorations, ["куст"]);
  const treesFound = pickTrees(decorations);
  const trees = treesFound.length > 0 ? treesFound : shrubs;

  // Custom: заливаем всё выбранным terrainId. Декор ЯВНО стираем — иначе
  // старые деревья остались бы поверх «камня», к которому админ не звал их.
  if (biome === "custom") {
    const tid = opts?.customTerrainId;
    if (!tid) return out;
    for (const c of cells) out.set(cellKey(c), { terrainId: tid, decorationId: null });
    return out;
  }

  if (biome === "island") {
    const inSet = new Set(cells.map(cellKey));
    const interior = interiorSet(cells);
    // Совсем маленькое выделение (нет ни одной interior-клетки) — считать
    // островом бесполезно, из него получится только пляж. Так и заливаем.
    if (interior.size === 0) {
      for (const c of cells) {
        out.set(cellKey(c), { terrainId: idOrNull(sand), decorationId: null });
      }
      return out;
    }
    const beach = beachLayer(cells, interior, inSet);
    for (const c of cells) {
      const k = cellKey(c);
      if (!interior.has(k)) {
        out.set(k, { terrainId: idOrNull(water), decorationId: null });
      } else if (beach.has(k)) {
        out.set(k, { terrainId: idOrNull(sand), decorationId: null });
      } else {
        // Глубокая суша: трава + редкие деревья (15–20%). Верхнюю границу
        // берём случайно в этом же диапазоне, чтобы два прогона визуально
        // отличались, а не только позициями деревьев.
        const p = 0.15 + Math.random() * 0.05;
        const decId = Math.random() < p ? rollFrom(trees) : null;
        out.set(k, { terrainId: idOrNull(grass), decorationId: decId });
      }
    }
    return out;
  }

  if (biome === "forest") {
    // Плотный лес: 30–40% декоративных деревьев поверх лесной подложки.
    const p = 0.3 + Math.random() * 0.1;
    for (const c of cells) {
      const decId = Math.random() < p ? rollFrom(trees) : null;
      out.set(cellKey(c), { terrainId: idOrNull(forestT), decorationId: decId });
    }
    return out;
  }

  if (biome === "desert") {
    // Пустыня: сплошной песок, редкая (5%) сухая растительность.
    for (const c of cells) {
      const decId = Math.random() < 0.05 ? rollFrom(trees) : null;
      out.set(cellKey(c), { terrainId: idOrNull(desertT), decorationId: decId });
    }
    return out;
  }

  if (biome === "plain") {
    // Равнина: трава + 10% декор из общего пула (деревья и кусты, случайно).
    const pool = [...trees, ...shrubs.filter((s) => !trees.includes(s))];
    for (const c of cells) {
      const decId = Math.random() < 0.1 ? rollFrom(pool) : null;
      out.set(cellKey(c), { terrainId: idOrNull(grass), decorationId: decId });
    }
    return out;
  }

  return out;
}
