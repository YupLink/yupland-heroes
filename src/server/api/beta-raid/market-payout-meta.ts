// Подпись ПРЕДМЕТНОЙ цены: имя и картинка шаблона, который стоит за
// price_resource ∈ {pack,hero,art,boss,custom}.
//
// Два потребителя, одна таблица источников:
//   • скупка (market-sell) — что магазин ОТДАЁТ игроку. В рюкзаке стек
//     подписывается тем, что пришло с выдачей. Если брать подпись у позиции
//     скупки, игрок, сдавший муку, получал бы артефакт с именем «Скупка муки».
//   • витрина (market-extra) — на ЧТО меняется товар. Без имени плитка писала
//     безликое «1 товар», хотя в плавильне это главное: «2 Слитка железа и
//     1 Слиток золота».
//
// Витрина — горячий путь: окно постройки открывается на каждый тап по клетке,
// а позиций на клетке бывает десятки. Поэтому запрос ОДИН на всё окно
// (UNION ALL по нужным таблицам) и поверх него короткий кэш: шаблоны правит
// админ раз в неделю, а окно открывают раз в секунду.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { isArtAny } from "./art-rarity";
import type { MarketPriceResource } from "@/lib/marketItem";

export type Meta = { name: string; image: string | null };

/** Куда идти за шаблоном. Герой и артефакт лежат в одной таблице. */
type Group = "art" | "boss" | "custom" | "pack";

const GROUP: Partial<Record<MarketPriceResource, Group>> = {
  art: "art",
  hero: "art",
  boss: "boss",
  custom: "custom",
  pack: "pack",
};

/**
 * Ветка UNION по виду шаблона. Паки живут в ДВУХ таблицах (чип-паки cp_* и
 * NFT-паки), обложка в них зовётся по-разному — спрашиваем обе разом: пересечься
 * они не могут, а второй заход к базе стоил бы дороже лишней ветки.
 */
const SELECTS: Record<Group, (ids: string) => string> = {
  art: (ids) =>
    `SELECT 'art' AS g, id, name, image_url AS image
       FROM yuplink.mystic_item_template WHERE id IN (${ids})`,
  boss: (ids) =>
    `SELECT 'boss' AS g, id, name, image_url AS image
       FROM yuplink.raid_boss_template WHERE id IN (${ids})`,
  custom: (ids) =>
    `SELECT 'custom' AS g, id, name, image
       FROM yuplink.raid_custom_item WHERE id IN (${ids})`,
  pack: (ids) =>
    `SELECT 'pack' AS g, id, name, cover_image_url AS image
       FROM yuplink.chip_packs WHERE id IN (${ids})
     UNION ALL
     SELECT 'pack' AS g, id, name, image_url AS image
       FROM yuplink.nft_packs WHERE id IN (${ids})`,
};

/**
 * Кэш шаблонов. Держим и ПРОМАХИ (null): у удалённого шаблона иначе каждый
 * тап по клетке уходил бы в базу за одним и тем же «ничего».
 *
 * Минута — компромисс: переименование товара в админке доезжает до игроков не
 * мгновенно, зато витрина перестаёт ходить в базу вообще.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; meta: Meta | null }>();

function cacheGet(key: string): { meta: Meta | null } | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit;
}

/**
 * Положить в кэш. Просроченные записи умирают только при обращении к ним, а
 * шаблон могли удалить из админки — на переполнении чистим карту целиком:
 * ключей тут сотни, дешевле перечитать всё, чем городить вытеснение.
 */
function cacheSet(key: string, at: number, meta: Meta | null): void {
  if (cache.size > 500) cache.clear();
  cache.set(key, { at, meta });
}

/**
 * Ключ шаблона в карте метаданных. null — искать нечего:
 *  • цена обычным ресурсом (золото, лайки) — у неё своя иконка на клиенте;
 *  • пустой token — шаблон не выбран.
 */
export function priceMetaKey(res: MarketPriceResource | null, token: string | null): string | null {
  if (!res || !token) return null;
  const g = GROUP[res];
  return g ? `${g}:${token}` : null;
}

/** Строка ответа UNION-запроса. */
type Row = { g: string; id: string; name: string | null; image: string | null };

function toMeta(row: Row): Meta | null {
  const name = row.name?.trim();
  if (!name) return null;
  const image = row.image && String(row.image).trim() !== "" ? String(row.image) : null;
  return { name, image };
}

/**
 * Достать метаданные для набора ключей `${group}:${id}` ОДНИМ запросом.
 * Возвращает и найденное, и промахи (null) — чтобы вызывающий положил их в кэш.
 *
 * Сбой запроса ЛЕТИТ НАВЕРХ и промахом не притворяется: промах кэшируется на
 * минуту, и одна икота базы иначе оставляла бы всю витрину без подписей, а в
 * рюкзаке — стек с голым `cst_…` вместо имени, уже навсегда.
 */
async function fetchKeys(keys: Set<string>): Promise<Map<string, Meta | null>> {
  const out = new Map<string, Meta | null>();
  if (keys.size === 0) return out;
  const byGroup = new Map<Group, Set<string>>();
  for (const key of keys) {
    out.set(key, null); // пока не найдено — значит промах
    const cut = key.indexOf(":");
    const g = key.slice(0, cut) as Group;
    const id = key.slice(cut + 1);
    const set = byGroup.get(g) ?? new Set<string>();
    set.add(id);
    byGroup.set(g, set);
  }
  const parts: string[] = [];
  for (const [g, ids] of byGroup) {
    parts.push(SELECTS[g](Array.from(ids).map(sqlStr).join(",")));
  }
  const rows = (await mcpExec(parts.join("\nUNION ALL\n"), { wrapJson: true })) as Row[];
  for (const row of rows ?? []) {
    if (!row?.id) continue;
    out.set(`${row.g}:${row.id}`, toMeta(row));
  }
  return out;
}

/** Что просят/платят предметной ценой — с учётом кэша и одного запроса на всё. */
export type PriceRef = { res: MarketPriceResource | null; token: string | null };

/**
 * Метаданные предметных цен ПАЧКОЙ: один запрос на всё окно постройки.
 *
 * Псевдо-шаблоны «любой арт редкости X» (art_any_*) сюда не попадают
 * намеренно: их подпись у клиента лежит в словаре сразу на двух языках, а
 * сервер прислал бы только русскую и перебил бы перевод.
 */
export async function priceMetaBatch(refs: Iterable<PriceRef>): Promise<Map<string, Meta>> {
  const found = new Map<string, Meta>();
  const need = new Set<string>();
  for (const ref of refs) {
    if (isArtAny(ref.token)) continue;
    const key = priceMetaKey(ref.res, ref.token);
    if (!key || found.has(key) || need.has(key)) continue;
    const hit = cacheGet(key);
    if (hit) {
      if (hit.meta) found.set(key, hit.meta);
      continue;
    }
    need.add(key);
  }
  // Витрина — путь ПОКАЗА: сбой запроса не имеет права уронить окно постройки.
  // Отдаём то, что уже лежало в кэше, остальные плитки на минуту вернутся к
  // родовому слову («1 товар»). В кэш при этом не пишем НИЧЕГО: закэшированный
  // сбой держал бы витрину безымянной до истечения TTL.
  const fresh = await fetchKeys(need).catch(() => null);
  if (!fresh) return found;
  const at = Date.now();
  for (const [key, meta] of fresh) {
    cacheSet(key, at, meta);
    if (meta) found.set(key, meta);
  }
  return found;
}

/** Достать из готовой пачки метаданные одной цены. null — подписи нет. */
export function priceMetaOf(
  metas: Map<string, Meta>,
  res: MarketPriceResource | null,
  token: string | null,
): Meta | null {
  if (isArtAny(token)) return null;
  const key = priceMetaKey(res, token);
  return key ? (metas.get(key) ?? null) : null;
}

/**
 * Подпись ОДНОЙ выплаты (скупка). Не нашли шаблон — оставляем id: он хотя бы
 * отличает стеки друг от друга, а безымянный стек сливается с соседним.
 *
 * А вот СБОЙ запроса тут пробрасываем: имя выплаты уезжает в рюкзак навсегда,
 * и подменять его id из-за одной неудачной секунды нельзя. Зовут эту функцию
 * ДО списания товара (market-sell), так что бросок просто отменяет сделку.
 */
export async function payoutMeta(
  res: MarketPriceResource,
  token: string | null,
): Promise<Meta | null> {
  if (!token) return null;
  const key = priceMetaKey(res, token);
  if (!key) return null;
  const hit = cacheGet(key);
  if (hit) return hit.meta ?? { name: token, image: null };
  const fresh = await fetchKeys(new Set([key]));
  const at = Date.now();
  for (const [k, meta] of fresh) cacheSet(k, at, meta);
  return fresh.get(key) ?? { name: token, image: null };
}
