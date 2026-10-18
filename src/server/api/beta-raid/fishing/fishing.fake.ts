// Фейк базы для тестов рыбалки (§8.35): позиции, рыбалки аккаунтов, рюкзаки,
// справочник (удочки, лопаты), основной инструмент, выбранные герои, клетки
// берега и настройка. Операторы узнаются по тексту и исполняются по смыслу —
// как их выполнил бы Postgres под локами: старт (лок аккаунта), поимка (лок
// героя: CAS по счётчику, гард удочки в руках, износ hitStackTimes), «видели»,
// конец, отметка «другое действие». Часы — fx.now (мс).
import { alive, fx, pick, row } from "@/server/api/beta-raid/fishing/fishing.fake-state";
import {
  catchOp,
  read,
  readRow,
  start,
  toolState,
} from "@/server/api/beta-raid/fishing/fishing.fake-ops";

export {
  fx,
  packOf,
  resetFx,
  rodOkModel,
  saltOf,
  type FakeFishing,
} from "@/server/api/beta-raid/fishing/fishing.fake-state";

function run(sql: string): unknown[] {
  const acc = pick(sql, /account_id = '([^']+)'/);
  const f = fx.fishing.get(acc);
  // Досчёт «Улова»: забросы участников (в фейке все записаны) — строками чтения.
  const rows = sql.includes(
    "LEFT JOIN yuplink.beta_raid_positions p ON p.account_id = f.account_id",
  );
  if (rows && sql.includes("JOIN yuplink.tournament_entry e"))
    return [...fx.fishing.keys()].flatMap(readRow);
  if (rows) return read(sql);
  if (sql.includes("INSERT INTO yuplink.raid_fishing AS f")) return start(sql);
  if (sql.includes("SET tries = f.tries + d.done")) return catchOp(sql);
  if (sql.includes("SELECT claim, caught, tries FROM yuplink.raid_fishing"))
    return f ? [{ claim: f.claim, caught: f.caught, tries: f.tries }] : [];
  if (sql.includes("SET seen_at = GREATEST(seen_at")) {
    const obs = Number(pick(sql, /to_timestamp\((\d+) \/ 1000\.0\)/));
    if (f && f.op === pick(sql, /op = '([^']+)'/) && !f.stoppedAt && f.actedAt === null)
      f.seenAt = Math.max(f.seenAt, obs);
    return [];
  }
  if (sql.includes("SET stopped_at = LEAST(now()")) {
    if (!f || f.op !== pick(sql, /op = '([^']+)'/) || f.stoppedAt !== null) return [];
    f.stoppedAt = Math.min(fx.now, Number(pick(sql, /to_timestamp\((\d+) \/ 1000\.0\)/)));
    f.reason = pick(sql, /stop_reason = '([^']+)'/);
    return [{ reason: f.reason }];
  }
  // Журнал сделок: ключи улова — по ним старт узнаёт уже ловивший op.
  if (sql.includes("INSERT INTO yuplink.trade_journal")) {
    fx.journal.push(...[...sql.matchAll(/'(fish:[^']+)'/g)].map((m) => m[1]));
    return [];
  }
  if (sql.includes("SELECT account_id AS account FROM yuplink.raid_fishing")) {
    const hero = pick(sql, /hero_id = '([^']+)'/);
    const hit = [...fx.fishing].find(([, x]) => x.heroId === hero && x.stoppedAt === null);
    return hit ? [{ account: hit[0] }] : [];
  }
  if (sql.includes("AS land")) {
    const [q, r] = [Number(pick(sql, /c\.q = (-?\d+)/)), Number(pick(sql, /c\.r = (-?\d+)/))];
    if (!fx.cells.has(`${q},${r}`)) return [];
    const pairs = [...sql.matchAll(/\((-?\d+), (-?\d+)\)/g)].map((m) => `${m[1]},${m[2]}`);
    return [
      { land: fx.cells.get(`${q},${r}`) === false, water: pairs.some((c) => fx.cells.get(c)) },
    ];
  }
  if (sql.includes("FROM yuplink.settings WHERE key = 'fishing_config'"))
    return fx.cfg ? [{ value: JSON.stringify(fx.cfg) }] : [];
  if (sql.includes('AS "mainKey"')) return toolState(sql);
  if (sql.includes("SET main_tool =") && sql.includes("WITH upd AS")) {
    const hero = pick(sql, /WHERE hi\.id = '([^']+)'/);
    const key = /SET main_tool = NULL/.test(sql) ? null : pick(sql, /SET main_tool = '([^']+)'/);
    const ok = key === null || alive(hero, key);
    if (ok) fx.main.set(hero, key);
    return row({ set: ok });
  }
  return [];
}

/** mcpExec фейка: сбой до записи (failOn) и потерянный ответ (loseOn) — по метке оператора. */
export async function fakeExec(sql: string): Promise<unknown[]> {
  fx.sql.push(sql);
  await Promise.resolve();
  const fail = fx.failOn;
  if (fail && sql.includes(fail.tag) && fail.skip-- <= 0) {
    fx.failOn = null;
    throw new Error("MCP timeout");
  }
  const out = run(sql);
  if (fx.loseOn && sql.includes(fx.loseOn)) {
    fx.loseOn = null;
    throw new Error("MCP timeout");
  }
  return out;
}

/** «Другое действие» (трата энергии): отметка, как actedSql. */
export function act(acc: string): void {
  const f = fx.fishing.get(acc);
  if (!f || f.stoppedAt !== null || f.actedAt !== null) return;
  f.actedAt = fx.now;
  f.actedPos = fx.pos.get(acc)?.ver ?? null;
}
