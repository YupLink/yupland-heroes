// Операторы фейка рыбалки, исполняемые по смыслу (fishing.fake): чтение
// рыбалки, старт под локом аккаунта, поимка под локом героя (CAS по счётчику,
// гард удочки в руках — rodOkModel, износ hitStackTimes) и чтение инструментов.
import { hitStackTimes } from "@/lib/raid/toolWear";
import {
  alive,
  fx,
  idOf,
  isRod,
  packOf,
  pick,
  rodOkModel,
  row,
  saltOf,
} from "@/server/api/beta-raid/fishing/fishing.fake-state";

/** Чтение рыбалки одного аккаунта (readSql). */
export const read = (sql: string): unknown[] =>
  readRow(pick(sql, /WHERE f\.account_id = '([^']+)'/));

/** Строка рыбалки аккаунта с позицией героя, как rowsSql; строки нет — пусто. */
export function readRow(acc: string): unknown[] {
  const f = fx.fishing.get(acc);
  if (!f) return [];
  const p = fx.pos.get(acc);
  const samePlace = !!p && p.q === f.q && p.r === f.r && p.map === f.mapId && p.ver === f.posAt;
  return [
    {
      account: acc,
      op: f.op,
      heroId: f.heroId,
      mapId: f.mapId,
      q: f.q,
      r: f.r,
      tries: f.tries,
      planTries: f.planTries,
      chancePct: f.chancePct ?? null,
      chanceSteps: f.chanceSteps ?? null,
      salt: f.salt,
      caught: f.caught,
      nextMs: f.nextAt,
      seenMs: f.seenAt,
      actedMs: f.actedAt,
      nowMs: fx.now,
      stopped: f.stoppedAt !== null,
      samePlace,
      actedHere: f.actedPos === f.posAt,
      heroOn: fx.selected.has(f.heroId),
    },
  ];
}

export function start(sql: string): unknown[] {
  const [, acc, op, hero, map] =
    /SELECT '([^']+)', '([^']+)', '([^']+)', '([^']+)', pos\.q/.exec(sql) ?? [];
  const [q, r] = [Number(pick(sql, /p\.q = (-?\d+) AND/)), Number(pick(sql, /p\.r = (-?\d+)\n/))];
  const interval = Number(pick(sql, /now\(\) \+ (\d+) \* interval/));
  const planTries = Number(pick(sql, /interval '1 minute', 0, 0,\s+(\d+),/)) || 1;
  // Шанс и ступени — следом за заказом попыток (NULL — нет).
  const [, pct, steps] =
    /interval '1 minute', 0, 0,\s+\d+,\s+(NULL|[\d.]+),\s+(NULL|'[^']*'::jsonb),/.exec(sql) ?? [];
  const p = fx.pos.get(acc);
  const here = !!p && p.q === q && p.r === r;
  const cur = fx.fishing.get(acc);
  // Ключ, которым аккаунт уже ловил (улов в журнале), — как usedOpSql.
  const prefix = pick(sql, /left\(j\.ref, \d+\) = '([^']+)'/);
  const used = !!prefix && fx.journal.some((ref) => ref.startsWith(prefix));
  const blocked = !!cur && (cur.op === op || cur.stoppedAt === null);
  if (!here || blocked || used)
    return row({ put: null, here, cur: cur?.op ?? null, active: !!cur && !cur.stoppedAt, used });
  fx.fishing.set(acc, {
    op,
    heroId: hero,
    mapId: map,
    q,
    r,
    posAt: p.ver,
    nextAt: fx.now + interval * 60_000,
    tries: 0,
    caught: 0,
    seenAt: fx.now,
    actedAt: null,
    actedPos: null,
    claim: null,
    stoppedAt: null,
    reason: null,
    planTries,
    salt: saltOf(op),
    chancePct: pct && pct !== "NULL" ? Number(pct) : null,
    chanceSteps: steps && steps !== "NULL" ? steps.slice(1, -"'::jsonb".length) : null,
  });
  return row({ put: op, here, cur: cur?.op ?? null, active: false, used });
}

export function catchOp(sql: string): unknown[] {
  const hero = pick(sql, /hashtext\('bp:([^']+)'\)/);
  const key = pick(sql, /b\.stack_key = '([^']+)' AND b\.count >= 1/);
  const [, acc, op, was] =
    /f\.account_id = '([^']+)' AND f\.op = '([^']+)' AND f\.tries = (\d+)/.exec(sql) ?? [];
  const k = Number(pick(sql, /LEAST\((\d+), x\.first/));
  const succ = pick(sql, /unnest\(ARRAY\[([\d, ]*)\]::int\[\]\)/)
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => x > 0);
  const step = Number(pick(sql, /\(100 - x\.wear\) \/ \((\d+)\)::numeric/));
  const interval = Number(pick(sql, /d\.done \* (\d+)\) \* interval/));
  const nonce = pick(sql, /claim = '([^']+)'/);
  const seen = /GREATEST\(f\.seen_at, to_timestamp\((\d+) \/ 1000\.0\)\)/.exec(sql)?.[1];
  const f = fx.fishing.get(acc);
  const live = !!f && f.op === op && f.tries === Number(was) && f.stoppedAt === null;
  const main = rodOkModel(hero, key);
  const s = packOf(hero).get(key);
  // Удар удочкой — каждая попытка (заброс), с рыбой и без; рыба — попытки из succ.
  const res = live && main && s && s.count >= 1 ? hitStackTimes(s, step, k) : null;
  const done = res?.hits ?? 0;
  const hits = succ.filter((x) => x <= done).length;
  if (live && f && done > 0) {
    if (res && s) {
      Object.assign(s, { count: res.count, wear: res.wear });
      fx.main.set(hero, key);
    }
    f.tries += done;
    f.caught += hits;
    f.nextAt += done * interval * 60_000;
    f.claim = nonce;
    if (seen) f.seenAt = Math.max(f.seenAt, Number(seen));
  }
  const cur = fx.fishing.get(acc);
  return row({
    hits: live ? hits : 0,
    done,
    live,
    main,
    have: alive(hero, key),
    claim: cur?.claim ?? null,
    caught: cur?.caught ?? null,
    tries: cur?.tries ?? null,
  });
}

export function toolState(sql: string): unknown[] {
  const hero = pick(sql, /hi\.id = '([^']+)'/);
  const key = fx.main.get(hero) ?? null;
  const stacks = [...packOf(hero)]
    .filter(([, s]) => s.count >= 1)
    .map(([stackKey, s]) => {
      const c = fx.catalog.get(idOf(stackKey));
      return {
        stackKey,
        count: s.count,
        wear: s.wear,
        shovel: c?.shovel === true,
        rod: c?.rod === true,
        name: c?.name ?? stackKey,
        toolWear: c?.wear ?? null,
      };
    });
  return [{ mainKey: key, mainShovel: false, mainRod: isRod(key), stacks }];
}
