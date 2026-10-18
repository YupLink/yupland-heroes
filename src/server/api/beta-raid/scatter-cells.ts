// Подбор свободных клеток под массовую раскладку объектов.
//
// Ядро «переразложить»: админ говорит «пятьдесят сундуков на болота, сорок
// боссов в горы», а карта отвечает, куда именно они встанут. Заявка приходит
// местностью, а не клетками, — какие клетки на карте пусты, знает только база,
// и знает она это ровно секунду.
//
// Поэтому здесь ЖРЕБИЙ, а не выбор: клетки берутся случайные (ORDER BY random),
// одна клетка не достаётся двум заявкам, а всё, чего не хватило, возвращается
// числом. С сидом жребий перестаёт быть безымянным: порядок считает md5 от
// «сид:q,r», и тот же сид на той же карте разложит объекты по тем же клеткам —
// иначе неудачную раскладку можно только переделать наугад.
//
// Молча положить сорок сундуков вместо пятидесяти нельзя: на карте по
// иным типам местности свободно четыре клетки (Радуга) и одна (Грядка), и
// «раскладка прошла» без единого слова о недостаче — это ложь в отчёте.
//
// Результат этого модуля — НАМЕРЕНИЕ, а не бронь. Между жребием и записью
// админ красит карту руками, игроки ходят, грибы разбегаются; настоящую
// проверку свободности делает сама запись (scatter-apply), здесь же — разведка.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { FREE_CELL, cellOrder, pickAnyLand, type CellRef } from "./scatter-land";

// SQL свободной клетки, порядок жребия и добор с суши живут в scatter-land.ts
// (лимит 250 строк); прежние импорты отсюда продолжают работать.
export { FREE_CELL, cellOrder, type CellRef };

/**
 * Заявка: сколько мест нужно на конкретной местности (terrainId=null — любая
 * суша). `terrains` — «только эти местности» (уровень местности у боссов): и
 * добор недостачи идёт только по ним, на чужую сушу такая заявка не выходит.
 */
export type LandRequest = {
  terrainId: string | null;
  count: number;
  terrains?: readonly string[] | null;
};

/** Раздача мест: сколько удалось дать под каждую заявку и чего не хватило. */
export type LandGrant = {
  cells: CellRef[];
  /** Не нашлось вовсе — ни на своей местности, ни на суше. */
  short: number;
  /** Из выданного — сколько ушло на чужую сушу, потому что своей не хватило. */
  fallback: number;
};

/**
 * Сколько разных местностей просим одним запросом. Ограничение не про базу (там
 * 20 мс на восемь групп), а про длину SQL: мост режет слишком длинные запросы,
 * и лучше два коротких рейса, чем один отказ.
 */
const GROUPS_PER_QUERY = 40;

type Pools = Map<string, CellRef[]>;

const cellRows = (rows: unknown[]): Array<{ tid?: string; q: number; r: number }> =>
  (rows ?? []) as Array<{ tid?: string; q: number; r: number }>;

/**
 * Жребий по конкретным местностям — ОДНИМ запросом на пачку местностей.
 *
 * `free` считается один раз и режется по каждой местности отдельно (LATERAL):
 * иначе на каждую местность был бы свой проход по 44 тысячам клеток. Клетки
 * разных местностей не пересекаются по определению, поэтому пересечься выданное
 * между группами не может.
 */
async function pickByTerrain(
  mapId: string,
  need: Map<string, number>,
  seed?: number | null,
): Promise<Pools> {
  const pools: Pools = new Map();
  const groups = [...need.entries()].filter(([, n]) => n > 0);
  for (let i = 0; i < groups.length; i += GROUPS_PER_QUERY) {
    const chunk = groups.slice(i, i + GROUPS_PER_QUERY);
    const values = chunk.map(([tid, n]) => `(${sqlStr(tid)}::text, ${n}::int)`).join(",");
    const rows = await mcpExec(
      `WITH need(tid, n) AS (VALUES ${values}),
            free AS MATERIALIZED (
              SELECT c.q, c.r, c.terrain_id
                FROM yuplink.raid_map_cells c
               WHERE c.map_id = ${sqlStr(mapId)}
                 AND c.terrain_id IN (SELECT tid FROM need)
                 AND ${FREE_CELL}
            )
       SELECT need.tid, p.q, p.r
         FROM need
         JOIN LATERAL (SELECT f.q, f.r FROM free f
                        WHERE f.terrain_id = need.tid
                        ORDER BY ${cellOrder(seed, "f")} LIMIT need.n) p ON true;`,
      { wrapJson: true },
    );
    for (const row of cellRows(rows)) {
      const list = pools.get(String(row.tid)) ?? [];
      list.push({ q: Number(row.q), r: Number(row.r) });
      pools.set(String(row.tid), list);
    }
  }
  return pools;
}

/** Сколько мест просит заявка — целым и неотрицательным, что бы ни прислали. */
const want = (req: LandRequest): number =>
  Number.isFinite(req.count) ? Math.max(0, Math.floor(req.count)) : 0;

/**
 * Разыграть свободные клетки под заявки.
 *
 * Порядок обслуживания не случаен: сначала заявки со СВОЕЙ местностью, и только
 * потом общий котёл суши. Наоборот было бы хуже — сорок артефактов «куда
 * угодно» разобрали бы те самые четыре клетки Радуги, на которых обязан стоять
 * радужный босс, и он остался бы ни с чем при полной карте свободных мест.
 *
 * Клетки одной местности разбираются заявками в том порядке, в каком они
 * пришли: при дефиците первый в списке получает своё целиком, последний —
 * остаток. Делить поровну смысла нет: в отчёте недостача всё равно одна на всех.
 */
export async function pickCells(
  mapId: string,
  requests: LandRequest[],
  seed?: number | null,
): Promise<LandGrant[]> {
  const grants: LandGrant[] = requests.map(() => ({ cells: [], short: 0, fallback: 0 }));
  if (requests.length === 0) return grants;

  const need = new Map<string, number>();
  for (const req of requests) {
    const n = want(req);
    if (req.terrainId && n > 0) need.set(req.terrainId, (need.get(req.terrainId) ?? 0) + n);
  }
  const pools = await pickByTerrain(mapId, need, seed);

  // Раздаём своё. `taken` копится общим списком: он же вычитается из котла суши.
  const taken: CellRef[] = [];
  requests.forEach((req, i) => {
    if (!req.terrainId) return;
    const pool = pools.get(req.terrainId);
    if (!pool) return;
    const got = pool.splice(0, want(req));
    grants[i].cells.push(...got);
    taken.push(...got);
  });

  // Добор с суши: и заявки «куда угодно», и те, кому своей местности не хватило.
  // Котлов столько, сколько разных ограничений «только эти местности»: заявка
  // с уровнем местности добирает только из своих местностей.
  const poolKey = (req: LandRequest) => (req.terrains ? [...req.terrains].sort().join("|") : "*");
  const pools2 = new Map<string, { terrains: readonly string[] | null; idx: number[] }>();
  requests.forEach((req, i) => {
    if (want(req) - grants[i].cells.length <= 0) return;
    const k = poolKey(req);
    const e = pools2.get(k) ?? { terrains: req.terrains ?? null, idx: [] };
    e.idx.push(i);
    pools2.set(k, e);
  });
  for (const { terrains, idx } of pools2.values()) {
    const missing = idx.reduce((sum, i) => sum + want(requests[i]) - grants[i].cells.length, 0);
    const land = await pickAnyLand(mapId, missing, taken, seed, terrains);
    taken.push(...land);
    for (const i of idx) {
      const req = requests[i];
      const miss = want(req) - grants[i].cells.length;
      const got = land.splice(0, miss);
      grants[i].cells.push(...got);
      // Своей местности не досталось — отмечаем, что место чужое: в отчёте это
      // не ошибка, но и не «всё как просили».
      if (req.terrainId) grants[i].fallback = got.length;
      grants[i].short = miss - got.length;
    }
  }
  return grants;
}
