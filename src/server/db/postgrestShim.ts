// PostgREST-совместимый fetch для @supabase/postgrest-js.
// Принимает HTTP-запросы как делает PostgREST, транслирует в SQL и шлёт
// через postgres-mcp execute_sql. Возвращает Response с JSON body
// и нужными заголовками (Content-Range для count'ов, status'ы 200/201/204).
//
// Поддерживает то, что реально использует pg.ts + supabase-js builder:
//   GET   /rest/v1/<table>?select=...&col=op.val&order=col.dir&limit/offset
//   POST  /rest/v1/<table>  (INSERT/UPSERT)
//   PATCH /rest/v1/<table>?col=eq.val  (UPDATE)
//   DELETE /rest/v1/<table>?col=eq.val
//   POST  /rest/v1/rpc/<fn>  (RPC, SELECT * FROM yuplink.<fn>(...))
//
// Заголовки:
//   Accept-Profile / Content-Profile → schema (yuplink/public)
//   Prefer: return=representation → RETURNING *
//   Prefer: resolution=merge-duplicates → ON CONFLICT DO UPDATE
//   Prefer: count=exact → ставим в Content-Range
//   Range: a-b → LIMIT/OFFSET
//
// НЕ поддерживается (бросаем Error если встретим):
//   - JOIN'ы через select=table(*)
//   - or/and в query
//   - JSON-операторы (col->>x)
// Если что-то из этого появится в коде — добавим.

import { mcpExec } from "./mcpClient";

const FAKE_HOST = "https://supabase-mcp.local";

export function getFakeSupabaseUrl(): string {
  return FAKE_HOST;
}

// SQL-quoting. Используется ТОЛЬКО внутри shim'а — не передаём user-данные
// без quote'а. Postgres-стандарт: одинарная кавычка экранируется удвоением.
function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (Array.isArray(v)) {
    // Heuristic: массив объектов → jsonb (для колонок типа jsonb, например
    // chip_pack_grants.result_chips). Массив примитивов или пустой → text[]
    // (для колонок типа text[]/int[]). Это покрывает наши реальные случаи:
    // result_chips=[{...}], scope_token_ids=[...], notification queue и т.п.
    const hasObjects = v.some(
      (x) => x !== null && typeof x === "object" && !Array.isArray(x)
    );
    if (hasObjects) {
      // Сериализуем как JSON-массив объектов → ::jsonb
      return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    }
    // Пустой массив: ARRAY[] нетипизирован → Postgres не может вывести тип и
    // роняет INSERT («cannot determine type of empty array»). Литерал '{}'
    // приводится к типу колонки (int[]/text[]) по контексту при INSERT/UPDATE.
    // (Это ломало создание yupik в прихожей → пустой экран у КАЖДОГО нового
    // игрока, marathon_reward_days=[].)
    if (v.length === 0) return "'{}'";
    // Простой массив (text[] / int[]) — ARRAY[...]
    return `ARRAY[${v.map((x) => sqlLiteral(x)).join(", ")}]`;
  }
  if (typeof v === "object") {
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

// jsonb-колонки (по факту миграций). Для НИХ массив/объект надо писать как
// '<json>'::jsonb, а НЕ как нативный ARRAY[...] — Postgres роняет присвоение
// integer[]/text[] → jsonb («column is of type jsonb but expression is of type
// integer[]»). Это ломало marathonClaim с 3-го дня (marathon_reward_days=[3]) и
// batch-выплаты (tx_hashes) уже ПОСЛЕ on-chain перевода. Нативные text[]/int[]
// колонки (creator_chip_ids, opponent_chip_ids) СЮДА НЕ входят — им нужен
// ARRAY[...] из sqlLiteral. Строку считаем уже-сериализованным JSON (часть
// вызовов сама шлёт JSON.stringify(...)).
const JSONB_COLUMNS = new Set([
  "marathon_reward_days",
  "reward_tiers",
  "items",
  "pairs",
  "tg_message_ids",
  "tx_hashes",
  "result_chips",
  // immunities — массив СТРОК (["Яд",…]) в jsonb-колонке. Без этой записи
  // sqlLiteral рендерил его как ARRAY['Яд'] (text[]) → Postgres роняет
  // присвоение text[]→jsonb → сохранение иммунитетов молча падало
  // (админ выбирал резисты, сохранял, при перезаходе — пусто).
  "immunities",
  // chip_collection_hero: spec_weights (массив объектов) + hero_template_ids
  // (массив СТРОК) — оба jsonb; hero_template_ids без записи упал бы как text[].
  "spec_weights",
  "hero_template_ids",
  // raid_maps.routes — механика путей удалена, но колонка осталась. Пустой
  // массив без этой записи писался как '{}' (пустой ОБЪЕКТ) и валил любой
  // for…of по routes — см. историю «n is not iterable» в бета-рейде.
  "routes",
  // energy_packs.price_steps — лестница цен (массив объектов). Пустой массив
  // без этой записи лёг бы как '{}' и сломал перебор ступеней.
  "price_steps",
]);

function sqlValueForColumn(col: string, v: unknown): string {
  if (JSONB_COLUMNS.has(col)) {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "string") {
      // Уже JSON-строка (напр. JSON.stringify(messageIds)) — не пере-кодируем.
      return `'${v.replace(/'/g, "''")}'::jsonb`;
    }
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  }
  return sqlLiteral(v);
}

function sqlIdent(name: string): string {
  // Допускаем только safe identifiers (буквы, цифры, _). Иначе bail.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`unsafe identifier: ${name}`);
  }
  return `"${name}"`;
}

// Парсит PostgREST оператор "eq.value", "in.(a,b,c)", "is.null" и т.п.
// Возвращает SQL фрагмент: `<column> <op> <value>`.
function parseFilterOp(column: string, value: string): string {
  const col = sqlIdent(column);
  // not.<op>.<value> → NOT (<op>)
  if (value.startsWith("not.")) {
    const inner = parseFilterOp(column, value.slice(4));
    return `NOT (${inner})`;
  }
  const dot = value.indexOf(".");
  if (dot === -1) {
    throw new Error(`unknown filter syntax: ${column}=${value}`);
  }
  const op = value.slice(0, dot);
  const rhs = value.slice(dot + 1);
  switch (op) {
    case "eq":
      return `${col} = ${sqlLiteral(rhs)}`;
    case "neq":
      return `${col} <> ${sqlLiteral(rhs)}`;
    case "gt":
      return `${col} > ${sqlLiteral(rhs)}`;
    case "gte":
      return `${col} >= ${sqlLiteral(rhs)}`;
    case "lt":
      return `${col} < ${sqlLiteral(rhs)}`;
    case "lte":
      return `${col} <= ${sqlLiteral(rhs)}`;
    case "is":
      if (rhs === "null") return `${col} IS NULL`;
      if (rhs === "true") return `${col} IS TRUE`;
      if (rhs === "false") return `${col} IS FALSE`;
      return `${col} IS ${sqlLiteral(rhs)}`;
    case "in": {
      // in.(a,b,c) или in.("a","b")
      let body = rhs;
      if (body.startsWith("(") && body.endsWith(")")) {
        body = body.slice(1, -1);
      }
      // Split с учётом кавычек. PostgREST: значения через запятую, иногда в "".
      const items: string[] = [];
      let cur = "";
      let inQuote = false;
      for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (c === '"' && body[i - 1] !== "\\") {
          inQuote = !inQuote;
          continue;
        }
        if (c === "," && !inQuote) {
          items.push(cur);
          cur = "";
          continue;
        }
        cur += c;
      }
      if (cur) items.push(cur);
      if (items.length === 0) return "FALSE"; // IN () даёт пусто
      return `${col} IN (${items.map((x) => sqlLiteral(x)).join(", ")})`;
    }
    case "like":
      return `${col} LIKE ${sqlLiteral(rhs.replace(/\*/g, "%"))}`;
    case "ilike":
      return `${col} ILIKE ${sqlLiteral(rhs.replace(/\*/g, "%"))}`;
    default:
      throw new Error(`unsupported filter op: ${op} (${column}=${value})`);
  }
}

// Парсит order=col.asc|col.desc[.nullsfirst|.nullslast] (через запятые).
function parseOrder(value: string): string {
  return value
    .split(",")
    .map((item) => {
      const parts = item.split(".");
      const col = sqlIdent(parts[0]);
      const dir = parts[1]?.toLowerCase();
      let s = col;
      if (dir === "desc") s += " DESC";
      else s += " ASC";
      if (parts[2]?.toLowerCase() === "nullsfirst") s += " NULLS FIRST";
      else if (parts[2]?.toLowerCase() === "nullslast") s += " NULLS LAST";
      return s;
    })
    .join(", ");
}

function preferHeader(prefer: string | null): {
  returning: boolean;
  upsert: boolean;
  count: boolean;
} {
  if (!prefer) return { returning: false, upsert: false, count: false };
  const parts = prefer.split(",").map((p) => p.trim());
  return {
    returning: parts.includes("return=representation"),
    upsert: parts.includes("resolution=merge-duplicates"),
    count: parts.some((p) => p === "count=exact" || p === "count=planned"),
  };
}

function rangeHeader(range: string | null): { offset: number; limit: number } | null {
  if (!range) return null;
  const m = range.match(/^(\d+)-(\d+)$/);
  if (!m) return null;
  const offset = Number(m[1]);
  const end = Number(m[2]);
  return { offset, limit: end - offset + 1 };
}

function selectClause(selectParam: string | null): string {
  if (!selectParam || selectParam === "*") return "*";
  // Простой случай: "col1,col2,col3"
  const cols = selectParam.split(",").map((c) => {
    const trimmed = c.trim();
    if (trimmed === "*") return "*";
    // Поддержим алиасы "alias:col" → "col AS alias"
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const alias = trimmed.slice(0, colonIdx);
      const col = trimmed.slice(colonIdx + 1);
      return `${sqlIdent(col)} AS ${sqlIdent(alias)}`;
    }
    return sqlIdent(trimmed);
  });
  return cols.join(", ");
}

type ParsedQuery = {
  select: string | null;
  order: string | null;
  limit: number | null;
  offset: number | null;
  filters: Array<{ col: string; raw: string }>;
  isCountHead: boolean;
  onConflict: string[] | null; // для upsert (берётся из query ?on_conflict=col1,col2)
  columns: string | null; // для INSERT (?columns=foo,bar — список полей)
  // Готовые SQL-фрагменты для or=(...) и and=(...) — соединяются c filters
  // через AND в buildWhere.
  rawClauses: string[];
};

// Разбивает строку списка фильтров «a.eq.1,b.gt.2,or(c.eq.3,d.eq.4)» по
// запятым ВЕРХНЕГО уровня, уважая вложенные скобки. Возвращает массив
// строковых элементов.
function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

// «ticket_cost.gt.0» → parseFilterOp("ticket_cost", "gt.0")
// «or(a.eq.X,b.eq.Y)» → рекурсивно объединяет через OR
// «and(a.eq.X,b.eq.Y)» → ... через AND
function parseLogicalFilter(s: string): string {
  s = s.trim();
  const orMatch = s.match(/^or\s*\((.*)\)$/);
  if (orMatch) {
    const inner = splitTopLevelCommas(orMatch[1]).map((x) =>
      parseLogicalFilter(x)
    );
    return "(" + inner.join(" OR ") + ")";
  }
  const andMatch = s.match(/^and\s*\((.*)\)$/);
  if (andMatch) {
    const inner = splitTopLevelCommas(andMatch[1]).map((x) =>
      parseLogicalFilter(x)
    );
    return "(" + inner.join(" AND ") + ")";
  }
  // Простой фильтр col.op.value
  const firstDot = s.indexOf(".");
  if (firstDot < 0) {
    throw new Error(`postgrestShim: bad logical filter «${s}»`);
  }
  const col = s.slice(0, firstDot);
  const rest = s.slice(firstDot + 1);
  return parseFilterOp(col, rest);
}

function parseSearchParams(sp: URLSearchParams): ParsedQuery {
  const out: ParsedQuery = {
    select: null,
    order: null,
    limit: null,
    offset: null,
    filters: [],
    isCountHead: false,
    onConflict: null,
    columns: null,
    rawClauses: [],
  };
  for (const [k, v] of sp.entries()) {
    switch (k) {
      case "select":
        out.select = v;
        break;
      case "order":
        out.order = v;
        break;
      case "limit":
        out.limit = Number(v);
        break;
      case "offset":
        out.offset = Number(v);
        break;
      case "on_conflict":
        // postgrest-js: .upsert({...}, { onConflict: 'col1,col2' })
        // шлёт ?on_conflict=col1,col2. Разбираем в массив.
        out.onConflict = v.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "columns":
        // postgrest-js: при insert разных по форме строк указывает явно поля.
        out.columns = v;
        break;
      case "or":
      case "and": {
        // postgrest-js: .or("a.eq.X,b.gt.Y") → ?or=(a.eq.X,b.gt.Y).
        // value начинается со скобки — снимаем её.
        let body = v;
        if (body.startsWith("(") && body.endsWith(")")) {
          body = body.slice(1, -1);
        }
        const items = splitTopLevelCommas(body).map((x) =>
          parseLogicalFilter(x)
        );
        const joiner = k === "or" ? " OR " : " AND ";
        out.rawClauses.push("(" + items.join(joiner) + ")");
        break;
      }
      case "not":
        throw new Error(`postgrestShim: not() пока не поддерживается`);
      default:
        // Это или filter (col=op.value) или unknown param.
        // Толерантно: неизвестные параметры без операторов игнорируем
        // (PostgREST поддерживает много дополнительных параметров —
        // лучше пропустить чем падать с ошибкой).
        if (v.includes(".")) {
          out.filters.push({ col: k, raw: v });
        }
        // Иначе — silently ignore
    }
  }
  return out;
}

function buildWhere(
  filters: Array<{ col: string; raw: string }>,
  rawClauses: string[] = []
): string {
  const parts: string[] = filters.map((f) => parseFilterOp(f.col, f.raw));
  parts.push(...rawClauses);
  if (parts.length === 0) return "";
  return ` WHERE ${parts.join(" AND ")}`;
}

async function execAndCount(
  sqlBody: string,
  table: string,
  schema: string,
  filters: Array<{ col: string; raw: string }>,
  rawClauses: string[] = []
): Promise<number | null> {
  const where = buildWhere(filters, rawClauses);
  const sql = `SELECT COUNT(*) AS cnt FROM ${sqlIdent(schema)}.${sqlIdent(
    table
  )}${where};`;
  const rows = await mcpExec(sql, { wrapJson: true });
  const r = rows[0] as { cnt: number } | undefined;
  return r ? Number(r.cnt) : null;
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

function pickSchema(headers: Headers, method: string): string {
  // GET → Accept-Profile, иначе Content-Profile.
  const h =
    method === "GET" || method === "HEAD"
      ? headers.get("accept-profile") || headers.get("content-profile")
      : headers.get("content-profile") || headers.get("accept-profile");
  return h || "public";
}

export async function postgrestShimFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input.toString());
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers || {});

  // Пути: /rest/v1/<table> или /rest/v1/rpc/<fn>
  const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?([^/]+)\/?$/);
  if (!m) {
    return new Response(`Not handled: ${url.pathname}`, { status: 501 });
  }
  const isRpc = !!m[1];
  const objectName = decodeURIComponent(m[2]);
  const schema = pickSchema(headers, method);

  try {
    if (isRpc) {
      return await handleRpc(objectName, schema, init, headers);
    }
    const sp = url.searchParams;
    const parsed = parseSearchParams(sp);
    const pref = preferHeader(headers.get("prefer"));
    const range = rangeHeader(headers.get("range"));
    const wantCount = pref.count;

    switch (method) {
      case "GET":
        return await handleSelect(objectName, schema, parsed, range, wantCount);
      case "HEAD":
        return await handleHead(objectName, schema, parsed, wantCount);
      case "POST":
        return await handleInsert(
          objectName,
          schema,
          init,
          headers,
          pref,
          parsed
        );
      case "PATCH":
        return await handleUpdate(objectName, schema, init, headers, pref, parsed);
      case "DELETE":
        return await handleDelete(objectName, schema, headers, pref, parsed);
      default:
        return new Response(`Method ${method} not supported`, { status: 405 });
    }
  } catch (e) {
    const msg = (e as Error).message || String(e);
    // PostgREST-стиль ошибки
    return jsonResponse({ message: msg, code: "SHIM_ERR" }, 400);
  }
}

async function handleSelect(
  table: string,
  schema: string,
  q: ParsedQuery,
  range: { offset: number; limit: number } | null,
  wantCount: boolean
): Promise<Response> {
  const cols = selectClause(q.select);
  const where = buildWhere(q.filters, q.rawClauses);
  const order = q.order ? ` ORDER BY ${parseOrder(q.order)}` : "";
  const limit =
    q.limit != null
      ? ` LIMIT ${q.limit}${q.offset != null ? ` OFFSET ${q.offset}` : ""}`
      : range
        ? ` LIMIT ${range.limit} OFFSET ${range.offset}`
        : "";
  const sql = `SELECT ${cols} FROM ${sqlIdent(schema)}.${sqlIdent(
    table
  )}${where}${order}${limit};`;
  const rows = await mcpExec(sql, { wrapJson: true });
  const extraHeaders: Record<string, string> = {};
  if (wantCount) {
    const total = await execAndCount(sql, table, schema, q.filters, q.rawClauses);
    const from = range?.offset ?? q.offset ?? 0;
    const to = from + rows.length - 1;
    extraHeaders["content-range"] = `${from}-${to < from ? from : to}/${total ?? "*"}`;
  }
  return jsonResponse(rows, 200, extraHeaders);
}

async function handleHead(
  table: string,
  schema: string,
  q: ParsedQuery,
  wantCount: boolean
): Promise<Response> {
  const extraHeaders: Record<string, string> = {};
  if (wantCount) {
    const total = await execAndCount("", table, schema, q.filters);
    extraHeaders["content-range"] = `*/${total ?? "*"}`;
  }
  return new Response(null, { status: 200, headers: extraHeaders });
}

function rowsToInsertSql(
  table: string,
  schema: string,
  rows: Record<string, unknown>[],
  pref: ReturnType<typeof preferHeader>,
  onConflictCols: string[] | null
): string {
  if (rows.length === 0) throw new Error("INSERT с пустым телом");
  // Берём union ключей всех строк (на случай если в строках разный набор полей).
  const cols = Array.from(
    new Set(rows.flatMap((r) => Object.keys(r)))
  );
  const colList = cols.map((c) => sqlIdent(c)).join(", ");
  const values = rows
    .map(
      (r) =>
        "(" +
        cols
          .map((c) => (c in r ? sqlValueForColumn(c, r[c]) : "DEFAULT"))
          .join(", ") +
        ")"
    )
    .join(",\n");
  let sql = `INSERT INTO ${sqlIdent(schema)}.${sqlIdent(
    table
  )} (${colList}) VALUES\n${values}`;
  if (pref.upsert && onConflictCols && onConflictCols.length > 0) {
    const conflict = onConflictCols.map((c) => sqlIdent(c)).join(", ");
    const updates = cols
      .filter((c) => !onConflictCols.includes(c))
      .map((c) => `${sqlIdent(c)} = EXCLUDED.${sqlIdent(c)}`)
      .join(", ");
    if (updates) {
      sql += `\nON CONFLICT (${conflict}) DO UPDATE SET ${updates}`;
    } else {
      sql += `\nON CONFLICT (${conflict}) DO NOTHING`;
    }
  } else if (pref.upsert) {
    sql += `\nON CONFLICT DO NOTHING`;
  }
  if (pref.returning) sql += `\nRETURNING *`;
  return sql + ";";
}

async function readBody(init: RequestInit | undefined): Promise<unknown> {
  if (!init?.body) return null;
  if (typeof init.body === "string") {
    try {
      return JSON.parse(init.body);
    } catch {
      return init.body;
    }
  }
  // Uint8Array / Blob / ReadableStream / FormData — постгрест-js всегда шлёт string
  return JSON.parse(String(init.body));
}

async function handleInsert(
  table: string,
  schema: string,
  init: RequestInit | undefined,
  headers: Headers,
  pref: ReturnType<typeof preferHeader>,
  parsed: ParsedQuery
): Promise<Response> {
  void headers;
  const body = await readBody(init);
  const rows: Record<string, unknown>[] = Array.isArray(body)
    ? (body as Record<string, unknown>[])
    : [body as Record<string, unknown>];
  // postgrest-js при .upsert({...}, { onConflict: 'a,b' }) ставит
  // ?on_conflict=a,b в URL — берём оттуда (parsed.onConflict).
  const onConflictCols = parsed.onConflict;
  const sql = rowsToInsertSql(table, schema, rows, pref, onConflictCols);
  const result = await mcpExec(sql, {
    wrapJsonCte: pref.returning,
  });
  if (pref.returning) {
    return jsonResponse(result, 201);
  }
  return emptyResponse(201);
}

async function handleUpdate(
  table: string,
  schema: string,
  init: RequestInit | undefined,
  headers: Headers,
  pref: ReturnType<typeof preferHeader>,
  parsed: ParsedQuery
): Promise<Response> {
  void headers;
  const body = (await readBody(init)) as Record<string, unknown>;
  const sets = Object.entries(body)
    .map(([k, v]) => `${sqlIdent(k)} = ${sqlValueForColumn(k, v)}`)
    .join(", ");
  const where = buildWhere(parsed.filters, parsed.rawClauses);
  if (!where) {
    throw new Error("UPDATE без WHERE запрещён");
  }
  let sql = `UPDATE ${sqlIdent(schema)}.${sqlIdent(
    table
  )} SET ${sets}${where}`;
  if (pref.returning) sql += ` RETURNING *`;
  sql += ";";
  const result = await mcpExec(sql, { wrapJsonCte: pref.returning });
  if (pref.returning) return jsonResponse(result, 200);
  return emptyResponse(204);
}

async function handleDelete(
  table: string,
  schema: string,
  headers: Headers,
  pref: ReturnType<typeof preferHeader>,
  parsed: ParsedQuery
): Promise<Response> {
  void headers;
  const where = buildWhere(parsed.filters, parsed.rawClauses);
  if (!where) {
    throw new Error("DELETE без WHERE запрещён");
  }
  let sql = `DELETE FROM ${sqlIdent(schema)}.${sqlIdent(table)}${where}`;
  if (pref.returning) sql += ` RETURNING *`;
  sql += ";";
  const result = await mcpExec(sql, { wrapJsonCte: pref.returning });
  if (pref.returning) return jsonResponse(result, 200);
  return emptyResponse(204);
}

async function handleRpc(
  fnName: string,
  schema: string,
  init: RequestInit | undefined,
  headers: Headers
): Promise<Response> {
  void headers;
  const args = ((await readBody(init)) ?? {}) as Record<string, unknown>;
  // Сортируем по имени аргумента — детерминированный вызов
  const keys = Object.keys(args).sort();
  const argList = keys.map((k) => `${k} := ${sqlLiteral(args[k])}`).join(", ");
  // SELECT * FROM yuplink.fn(arg := val, ...)
  // postgres-mcp execute_sql вернёт jsonable массив строк.
  const sql = `SELECT * FROM ${sqlIdent(schema)}.${sqlIdent(
    fnName
  )}(${argList});`;
  try {
    const rows = await mcpExec(sql, { wrapJson: true });
    return jsonResponse(rows, 200);
  } catch (e) {
    // Возвращаем ошибку в PostgREST-формате
    return jsonResponse({ message: (e as Error).message, code: "RPC_ERR" }, 400);
  }
}
