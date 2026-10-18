// Связка «входящая NFT → пак»: админская карта и подбор по названию.
// Вынесено из chips-mint-deposit-helpers.ts — тот перерос 250 строк.
import { pg } from "../db/pg";
import { STORE_NFT_CONTRACT } from "./chips-mint-helpers";

// ──────── Pack input mapping ────────

export async function getPackInputMap(): Promise<Record<string, string>> {
  const row = await pg.settings.findOne({ key: "chip_pack_input_map" });
  if (!row?.value) return {};
  try {
    return JSON.parse(row.value) as Record<string, string>;
  } catch {
    return {};
  }
}
export async function savePackInputMap(map: Record<string, string>): Promise<void> {
  await pg.settings.upsert(
    { key: "chip_pack_input_map", value: JSON.stringify(map) },
    { onConflict: "key" },
  );
}
export function packInputKey(contract: string, title: string): string {
  return `${contract.trim()}::${title.trim()}`;
}
/**
 * Названия, отчеканенные с опечаткой в количестве. Читаем их так, как
 * задумано (владелец, 11.10.2026): «1 6 World pack II (legendary)» — 20 NFT
 * 228376–228395 — это «16 World pack II (legendary)», 16 боксов World Pack II.
 * Без исключения число читалось как 1, остаток («6 World pack II…») ни с
 * каким паком не совпадал, и ввод отказывал. Ключ — название без лишних
 * пробелов, в нижнем регистре.
 */
const MISMINTED: Record<string, { count: number; base: string }> = {
  "1 6 world pack ii (legendary)": { count: 16, base: "World pack II (legendary)" },
};

export function stripLeadCount(title: string): { count: number; base: string } {
  const t = title.trim();
  const fix = MISMINTED[t.replace(/\s+/g, " ").toLowerCase()];
  if (fix) return { ...fix };
  const m = t.match(/^(\d{1,4})\s*[×xXхХ]?\s+(.+)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 1000) return { count: n, base: m[2].trim() };
  }
  return { count: 1, base: t };
}
export async function getPackInputReverseMap(): Promise<Map<string, string>> {
  const m = await getPackInputMap();
  return new Map(Object.entries(m));
}

/**
 * Название заминченной ФИШКИ: "#1 Market Pack (5 Stars)" — хвост "(N Stars)"
 * ставит buildChipNftTitle. Коллекция фишек и пак могут называться одинаково
 * («Market Pack», «Retro figurine»), поэтому по одному имени их не различить:
 * без этой проверки фишка игрока опознавалась как пак.
 */
export function isChipNftTitle(title: string): boolean {
  return /\(\s*\d+(?:\.\d+)?\s*Stars\+?\s*\)\s*$/i.test(title.trim());
}

/** Название без ведущего количества, всё остальное — как есть. */
function normalizeExact(title: string): string {
  return stripLeadCount(title).base.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * То же, но без хвоста в скобках: «#3 Market Pack (rare)» → «market pack».
 * Скобки на NFT несут редкость («(rare)»), но могут нести и СОРТ пака
 * («Dragon Pack (Premium)»), поэтому такое сравнение — только запасной путь и
 * только когда кандидат один: иначе за премиальную NFT выдавался обычный бокс.
 */
function normalizeLoose(title: string): string {
  return normalizeExact(title)
    .replace(/\([^)]*\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Из нескольких паков с одним именем берём активный. */
function preferActive<T extends { active: boolean }>(list: T[]): T | null {
  return list.find((p) => p.active) ?? list[0] ?? null;
}

/**
 * Пак для входящего NFT. Сначала явная связка из настройки, а если её нет —
 * ищем пак с ТОЧНО таким же названием и ЗАПОМИНАЕМ связку.
 *
 * Раньше связки заводились только руками, и из 18 активных паков их имели
 * шесть: NFT остальных уходили на склад, а бокс не выдавался («Market Pack»).
 */
export async function resolvePackForNftTitle(
  contract: string,
  title: string,
): Promise<string | null> {
  const map = await getPackInputMap();
  const explicit = map[packInputKey(contract, title)];
  if (explicit) return explicit;

  // Подбор по названию — ТОЛЬКО для нашего склада. Название чужой NFT задаёт
  // тот, кто её чеканит: достаточно было выпустить на своём контракте токен с
  // именем «Dragon pack» и обменять его на настоящий пак. Для любого другого
  // контракта нужна явная запись в админской карте — она задаётся руками и
  // содержит контракт в ключе.
  if (contract !== STORE_NFT_CONTRACT) return null;

  // Дальше — только паки: выведенную фишку по неточному совпадению имени
  // на пак не меняем (коллекция фишек и пак зовутся одинаково).
  if (isChipNftTitle(title)) return null;
  const { base } = stripLeadCount(title);
  const direct = map[packInputKey(contract, base)];
  if (direct) return direct;

  const wanted = normalizeExact(title);
  if (!wanted) return null;
  const { data } = await pg.chipPacks.raw().select("id,name,active");
  const packs = (data ?? []) as Array<{ id: string; name: string; active: boolean }>;

  // 1. Точное совпадение названия — вместе со скобками.
  let hit = preferActive(packs.filter((p) => normalizeExact(p.name) === wanted));
  if (!hit) {
    // 2. Запасной путь без скобок — принимаем ТОЛЬКО единственного кандидата.
    // «Dragon Pack» и «Dragon Pack (Premium)» так схлопывались в один пак:
    // за премиальную NFT игрок получал обычный бокс. Двусмысленность = отказ,
    // связку заводит админ руками.
    const loose = packs.filter((p) => normalizeLoose(p.name) === normalizeLoose(title));
    const active = loose.filter((p) => p.active);
    hit = active.length === 1 ? active[0] : loose.length === 1 ? loose[0] : null;
  }
  if (!hit) return null;

  // Запоминаем: связка появится в админке и дальше сработает мгновенно.
  map[packInputKey(contract, base)] = hit.id;
  await savePackInputMap(map);
  return hit.id;
}

/** Примет ли система это NFT (с учётом автосопоставления по названию). */
export async function nftInputSupported(contract: string, title: string): Promise<boolean> {
  return (await resolvePackForNftTitle(contract, title)) !== null;
}
