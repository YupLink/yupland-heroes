// Фейк базы для сумки зелий: рюкзак одного героя, галочки «зелье», ключи
// операций и полка склада.
//
// Выдача (depositToBackpack) считается ТЕМ ЖЕ SQL, что уйдёт в Postgres: фейк
// сам заполняет room/grow (CEIL по ячейкам, как база), а выражения fits и
// условие claim вычисляет мини-вычислителем (sqlExpr.ts) прямо из текста
// запроса. Каждый запрос выполняется целиком за один синхронный шаг — как
// под advisory-локом героя, взятым ОТДЕЛЬНЫМ оператором (его место в строке
// запроса проверяет тест: снимок Postgres этим фейком не воспроизвести).
// Чужой запрос — ошибка теста, а не тихий ноль.
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { dec, decNum } from "@/test/numeric";
import { evalSql } from "@/test/sqlExpr";

export const bag = {
  /** Стеки рюкзака героя: ключ → штук. */
  rows: new Map<string, number>(),
  /** Id товаров с галочкой «зелье». */
  potionIds: new Set<string>(),
  /** Занятые ключи операций (raid_backpack_op). */
  ops: new Set<string>(),
  /** Полка склада (общая): штук вида. */
  shelf: 0,
  /** Все запросы — нормализованные пробелы. */
  sql: [] as string[],
  /** Мост отдал не тот результат: выдача прошла, а ответ — строка лока. */
  garble: false,
};

export function resetBag(): void {
  bag.rows = new Map();
  bag.potionIds = new Set();
  bag.ops = new Set();
  bag.shelf = 0;
  bag.sql = [];
  bag.garble = false;
}

const cells = (n: number): number => Math.ceil(Math.max(0, n) / CELL_SIZE);
const idOf = (key: string): string => key.slice(key.indexOf(":") + 1);

/** Зелье ли стек — как POTION_JOIN: свой товар с галочкой. */
export const isPotionKey = (key: string): boolean =>
  key.startsWith("custom:") && bag.potionIds.has(idOf(key));

/** Ячейки героя по хранилищам сейчас. */
export function bagCells(): { items: number; potions: number } {
  let items = 0;
  let potions = 0;
  for (const [k, c] of bag.rows) {
    if (c <= 0) continue;
    if (isPotionKey(k)) potions += cells(c);
    else items += cells(c);
  }
  return { items, potions };
}

const need = (re: RegExp, s: string): string => {
  const m = re.exec(s);
  if (!m) throw new Error(`фейк не понял запрос: ${re} в ${s.slice(0, 160)}`);
  return m[1];
};

/** Выдача в рюкзак: room/grow — сами, fits и claim — из текста запроса. */
function deposit(s: string) {
  const key = need(/AND stack_key = '([^']+)'\), 0\) AS cur/, s);
  const qty = Number(need(/CEIL\(\(cur \+ ([^)]+)\)::numeric/, s));
  const op = need(/WHERE op = '([^']+)'\) AS was/, s);
  const cur = bag.rows.get(key) ?? 0;
  const { items, potions } = bagCells();
  const d = cells(cur + qty) - cells(cur);
  const f =
    /fits AS \( SELECT (.+?) AS occ, (.+?) AS pocc, (.+?) AS grow, (.+?) AS need_occ FROM grow/.exec(
      s,
    );
  if (!f) throw new Error(`фейк не нашёл fits: ${s.slice(0, 160)}`);
  const env = { items: dec(items), potions: dec(potions), d: dec(d) };
  const occ = evalSql(f[1], env);
  const pocc = evalSql(f[2], env);
  const grow = evalSql(f[3], env);
  const needOcc = evalSql(f[4], env);
  const cond = need(/WHERE NOT prior\.was AND (.+?) ON CONFLICT \(op\)/, s);
  const row = { need_occ: needOcc, occ, pocc, grow };
  const ok = evalSql(`CASE WHEN ${cond} THEN 1 ELSE 0 END`, row) === dec(1);
  const was = bag.ops.has(op);
  if (!was && ok) {
    bag.ops.add(op);
    bag.rows.set(key, cur + qty);
  }
  return {
    occ: decNum(occ),
    need_occ: decNum(needOcc),
    pocc: decNum(pocc),
    grow: decNum(grow),
    claimed: was || ok,
  };
}

/** mcpExec фейка. */
export function bagDb(raw: string): unknown[] {
  const s = raw.replace(/\s+/g, " ").trim();
  bag.sql.push(s);
  if (s.startsWith("SELECT id FROM yuplink.raid_custom_item")) {
    const ids = [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    return ids.filter((id) => bag.potionIds.has(id)).map((id) => ({ id }));
  }
  if (s.startsWith('SELECT b.stack_key AS "stackKey", b.count,')) {
    return [...bag.rows]
      .filter(([, c]) => c > 0)
      .map(([stackKey, count]) => ({ stackKey, count, potion: isPotionKey(stackKey) }));
  }
  // Выдача: лок героя отдельным оператором, затем WITH — ответ последнего.
  const LOCK = "SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l; ";
  if (s.startsWith(`${LOCK}WITH prior AS`)) {
    const row = deposit(s.slice(LOCK.length));
    return bag.garble ? [{ l: "" }] : [{ _row: row }];
  }
  if (s.startsWith("SELECT EXISTS(SELECT 1 FROM yuplink.raid_backpack_op WHERE op =")) {
    return [{ was: bag.ops.has(need(/WHERE op = '([^']+)'\) AS was/, s)) }];
  }
  if (s.startsWith("SELECT count FROM yuplink.raid_warehouse_slot")) {
    return bag.shelf > 0 ? [{ count: bag.shelf }] : [];
  }
  if (s.startsWith("UPDATE yuplink.raid_warehouse_slot w")) {
    const n = Number(need(/ROUND\(w\.count - ([^,]+), 9\)/, s));
    if (bag.shelf - n < -1e-9) return [];
    bag.shelf = Math.max(0, bag.shelf - n);
    return [{ kind: "custom", refId: null, name: "Зелье", image: null }];
  }
  if (s.startsWith("UPDATE yuplink.raid_warehouse_slot SET count = count +")) {
    bag.shelf += Number(need(/count = count \+ ([^,]+),/, s));
    return [];
  }
  throw new Error(`неожиданный SQL: ${s.slice(0, 160)}`);
}
