// Клиент к portal-prod postgres-mcp через SSE+POST.
// Держит одну SSE-сессию для всего процесса (warm Vercel function) —
// каждый execute_sql это один POST + чтение из открытого SSE.
//
// MCP-протокол:
//   1. GET /sse — открываем SSE stream, первое событие "endpoint" даёт
//      нам путь /messages/?session_id=... для POST'ов в эту сессию
//   2. POST initialize (JSON-RPC id=1), ждём ответ через SSE
//   3. POST notifications/initialized (без id)
//   4. POST tools/call {name:"execute_sql", arguments:{sql:"..."}} с id=N,
//      ждём событие "message" с тем же id
//
// При разрыве SSE — переоткрываем при следующем exec().

import { note as notePerf } from "../perf/trace";

const MCP_URL = process.env.MCP_DB_URL ?? "https://mcp.yupland.io/sse";
const MCP_TOKEN = process.env.MCP_DB_TOKEN ?? "";

if (!MCP_TOKEN) {
  // Не падаем сразу — pg.ts может загружаться при build-time
  // когда env ещё нет. Падать будем при первом запросе.
}

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

// ── Ограничитель одновременных запросов к мосту ─────────────────────────
//
// Канал к базе ОДИН на всё приложение. Пока запросов немного, это незаметно;
// но разбор потерянных платежей вместе с живым трафиком выдавал больше сотни
// одновременных, мост захлёбывался и рвал канал — а обрыв канала отбивает ВСЕ
// запросы в полёте разом. В логе это видно как ровная стена: 162 отказа
// «SSE closed» в одну секунду, все на живых экранах игроков.
//
// Очередь дешевле обрыва. Ждать своей очереди — миллисекунды, а обрыв стоит
// игроку четырёх попыток и ошибки на экране.
const MAX_INFLIGHT = 10;
let inflight = 0;
const queue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (inflight < MAX_INFLIGHT) {
    inflight++;
    return;
  }
  // Слот НАСЛЕДУЕТСЯ от освободившего — счётчик здесь не трогаем, иначе
  // между «отпустил» и «проснулся» его успевает занять третий (так уже
  // ошибались в ограничителе Sendler).
  await new Promise<void>((resolve) => queue.push(resolve));
}

function releaseSlot(): void {
  const next = queue.shift();
  if (next) {
    next(); // слот передан по наследству
    return;
  }
  inflight--;
}

class McpSession {
  private sessionPath: string | null = null;
  private abort: AbortController | null = null;
  private pending = new Map<number, PendingResolver>();
  private nextId = 100;
  private ready: Promise<void> | null = null;
  /** Номер поколения сессии. Растёт на каждом сбросе. */
  private gen = 0;

  /**
   * Сбросить сессию — но ТОЛЬКО если её ещё никто не сбросил.
   *
   * ⚠️ Здесь была причина «падений». При обрыве канала отваливаются ВСЕ запросы
   * в полёте разом (видели пачки по 28), и каждый в ретрае обнулял `ready` сам.
   * Дедуп открытия ломался, и вместо одного переоткрытия мост получал два
   * десятка одновременных — захлёбывался и рвал канал снова. Круг замыкался:
   * игроки видели «SSE closed» и «MCP POST 502» после всех попыток.
   */
  private resetIfCurrent(gen: number): void {
    if (gen !== this.gen) return; // кто-то уже сбросил — переоткрытие общее
    this.gen++;
    this.ready = null;
    this.sessionPath = null;
  }

  private async open(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = this._open();
    try {
      await this.ready;
    } catch (e) {
      this.ready = null;
      throw e;
    }
  }

  private async _open(): Promise<void> {
    if (!MCP_TOKEN) throw new Error("MCP_DB_TOKEN не задан");
    this.abort = new AbortController();
    const res = await fetch(MCP_URL, {
      headers: {
        Authorization: `Bearer ${MCP_TOKEN}`,
        Accept: "text/event-stream",
      },
      signal: this.abort.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`MCP SSE open failed: ${res.status}`);
    }

    // Получаем первый event "endpoint" с session_id
    const decoder = new TextDecoder();
    let buf = "";
    let endpointSeen = false;

    // Читаем SSE в фоне до закрытия. for-await важно: с getReader().read()
    // undici может буферизовать chunks. for-await отдаёт по-чанково.
    (async () => {
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          // Normalize CRLF → LF чтобы разделитель всегда был \n\n
          buf += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const c = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const ev = parseSseEvent(c);
            if (ev.event === "endpoint") {
              this.sessionPath = ev.data;
              endpointSeen = true;
            } else if (ev.event === "message") {
              try {
                const j = JSON.parse(ev.data) as {
                  id?: number;
                  result?: unknown;
                  error?: unknown;
                };
                if (typeof j.id === "number") {
                  const p = this.pending.get(j.id);
                  if (p) {
                    this.pending.delete(j.id);
                    if (j.error) {
                      p.reject(
                        new Error(
                          typeof j.error === "object"
                            ? JSON.stringify(j.error)
                            : String(j.error)
                        )
                      );
                    } else {
                      p.resolve(j.result);
                    }
                  }
                }
              } catch {
                /* ignore non-JSON SSE messages */
              }
            }
          }
        }
      } catch {
        /* reader cancelled — closeSession обнулит state */
      } finally {
        // SSE закрылся — все pending должны быть rejected
        for (const [, p] of this.pending) p.reject(new Error("SSE closed"));
        this.pending.clear();
        this.sessionPath = null;
        this.ready = null;
        if (this.abort) {
          try {
            this.abort.abort();
          } catch {}
        }
        this.abort = null;
      }
    })().catch(() => {});

    // Ждём endpoint event максимум 8 секунд
    const start = Date.now();
    while (!endpointSeen) {
      if (Date.now() - start > 8000) {
        try {
          this.abort?.abort();
        } catch {}
        throw new Error("MCP handshake: no endpoint event");
      }
      await sleep(30);
    }

    // Initialize + initialized
    await this.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "yuplink", version: "1.0" },
      },
    });
    await this.sendNotification({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
  }

  private async send(payload: {
    jsonrpc: string;
    id: number;
    method: string;
    params?: unknown;
  }): Promise<unknown> {
    if (!this.sessionPath) throw new Error("no session path");
    const url = `${new URL(MCP_URL).origin}${this.sessionPath}`;
    const p = new Promise<unknown>((resolve, reject) => {
      this.pending.set(payload.id, { resolve, reject });
      // Таймаут на каждый запрос — иначе зависнем если SSE молчит
      setTimeout(() => {
        if (this.pending.has(payload.id)) {
          this.pending.delete(payload.id);
          reject(new Error(`MCP timeout for id=${payload.id}`));
        }
      }, 30000);
    });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MCP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok && res.status !== 202) {
      this.pending.delete(payload.id);
      throw new Error(`MCP POST ${res.status}: ${await res.text()}`);
    }
    return p;
  }

  private async sendNotification(payload: {
    jsonrpc: string;
    method: string;
    params?: unknown;
  }): Promise<void> {
    if (!this.sessionPath) throw new Error("no session path");
    const url = `${new URL(MCP_URL).origin}${this.sessionPath}`;
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MCP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  /** Выполнить SQL и получить массив строк.
   *  Если caller указал JSON-wrapping (через wrapJson=true), оборачиваем
   *  SELECT/RETURNING в row_to_json — тогда timestamps/numerics приходят
   *  родными JSON-типами, не как Python-repr datetime. */
  async exec(
    sql: string,
    opts?: { wrapJson?: boolean; wrapJsonCte?: boolean }
  ): Promise<unknown[]> {
    let finalSql = sql;
    if (opts?.wrapJsonCte) {
      // Для INSERT/UPDATE/DELETE RETURNING * — оборачиваем через WITH-CTE.
      const trimmed = sql.replace(/;\s*$/, "");
      finalSql = `WITH _r AS (${trimmed}) SELECT row_to_json(_r.*) AS _row FROM _r;`;
    } else if (opts?.wrapJson) {
      // Для обычных SELECT — простой subquery.
      const trimmed = sql.replace(/;\s*$/, "");
      finalSql = `SELECT row_to_json(_t.*) AS _row FROM (${trimmed}) _t;`;
    }
    // Короткий путь: приложение, мост и база стоят в одной сети, и ходить в
    // соседний контейнер через публичный HTTPS-домен незачем. Тот же SQL, тот
    // же формат ответа; мост остаётся запасным — прямой канал сам уходит на
    // него при беде с соединением (directPg).
    //
    // Импорт ДИНАМИЧЕСКИЙ и только на сервере: этот файл затягивается в
    // клиентский граф, а вместе со статическим импортом драйвер pg уезжал в
    // бандл игрока (ПРАВИЛА: «серверный модуль утёк в клиент»).
    const direct = await loadDirect();
    if (direct?.directReady()) {
      const s = Date.now();
      try {
        const rows = await direct.directExec(finalSql);
        if (rows) {
          notePerf("бд: напрямую", Date.now() - s, { note: sqlLabel(finalSql) });
          return unwrapRows(rows, opts);
        }
      } catch (e) {
        // Ответ самой базы (синтаксис, ограничение) — это не повод идти на
        // мост: он ответил бы тем же, только вдвое дольше.
        notePerf("бд: напрямую", Date.now() - s, { error: true, note: sqlLabel(finalSql) });
        throw e;
      }
    }

    // Retry на 1 попытку при race-condition с SSE: между моментом когда
    // мы успешно прошли await this.open() и моментом отправки POST —
    // SSE-канал мог закрыться (Vercel function idle, network blip).
    // sessionPath обнулится в finally background-ридера; следующий send
    // упадёт с "no session path". Делаем force re-open и повтор.
    const sendOnce = async (): Promise<unknown> => {
      if (!this.ready || !this.sessionPath) {
        // НЕ обнуляем ready: фоновый ридер уже сделал это при обрыве, а лишнее
        // обнуление сломало бы дедуп открытия (см. resetIfCurrent).
        await this.open();
      }
      const id = this.nextId++;
      // Очередь к мосту — отдельная строка в отчёте: канал к базе ОДИН на весь
      // процесс, и «медленный запрос» частенько оказывается быстрым запросом,
      // простоявшим в очереди за чужим отчётом.
      const waitedFrom = Date.now();
      await acquireSlot();
      const waited = Date.now() - waitedFrom;
      if (waited > 0) notePerf("бд: очередь", waited);
      try {
        return await this.send({
          jsonrpc: "2.0",
          id,
          method: "tools/call",
          params: { name: "execute_sql", arguments: { sql: finalSql } },
        });
      } finally {
        releaseSlot();
      }
    };
    // Распознаём «pool is closed» / «pool-N is closed» / «connection
    // attempt failed» — postgres-mcp иногда сам закрывает пул соединений
    // и любой следующий запрос вернёт эту ошибку. Лечится переоткрытием
    // SSE-сессии (новый pool на той стороне).
    // ⚠️ Формулировку писать ШИРОКО. Прежний шаблон знал только «is closed», а
    // мост в проде говорит «the pool 'pool-4077' is already closed» — слово
    // «already» ломало совпадение, ошибка считалась неисправимой и летела
    // игроку БЕЗ единого повтора. В логах её не видно (она не логируется, а
    // возвращается наверх), поэтому «иногда доходит, чаще нет» выглядело
    // необъяснимым.
    // Сюда же — внутренние срывы самого моста. «'NoneType' object has no
    // attribute 'connection'» это тот же умерший пул, только сказанный
    // изнутри питона: запрос до базы не дошёл, повтор безопасен и обязателен.
    const isStalePoolError = (msg: string) =>
      /pool\b[^"]{0,60}?\bis (?:already )?closed/i.test(msg) ||
      /connection attempt failed/i.test(msg) ||
      /'NoneType' object has no attribute/i.test(msg) ||
      /ClosedResourceError/i.test(msg);

    // ⚠️ КОНТРАКТ РЕТРАЯ ДЛЯ ПИШУЩИХ ЗАПРОСОВ. Повтор шлётся вслепую: ответ
    // мог не дойти уже ПОСЛЕ того, как БД применила запись. Значит любой SQL,
    // который сюда попадает, обязан быть идемпотентным по своему ключу — и,
    // главное, обязан одинаково ОТВЕЧАТЬ на первой попытке и на повторе.
    // Классическая мина — `INSERT ... ON CONFLICT DO NOTHING RETURNING`: свою
    // же вставку повтор видит как чужую (ноль строк) и код читает это как
    // «занято кем-то другим». Так терялись паки за введённые NFT. Лечение —
    // на стороне запроса: пишем свой op_id и `DO UPDATE SET op_id = <старый>`,
    // чтобы RETURNING всегда отдавал строку и было видно, чья она
    // (chips-mint-deposit-receipt.ts). Убирать ретрай нельзя: он держит всё
    // приложение живым, пока postgres-mcp пересоздаёт пул.
    //
    // Ретрай с бэкоффом: postgres-mcp периодически закрывает пул соединений
    // («pool-N is closed»), и запрос, попавший в окно закрытия, падает. Одной
    // попытки мало — если переоткрытие тоже попало на закрытый/сырой пул,
    // ошибка летела юзеру («Не удалось привязать сессию»). Теперь до 4 попыток:
    // каждая форсит свежую SSE-сессию (новый pool на MCP-стороне) + растущий
    // бэкофф, чтобы прокси успел поднять живой пул. Ошибка ловится и в throw,
    // и в текстовом «Error: pool is closed».
    const MAX_TRIES = 4;
    let text = "[]";
    let lastErr: Error | null = null;
    let genAtSend = this.gen;
    // Сколько стоил ЭТОТ запрос вместе со всеми повторами — то, что реально
    // ждал игрок. Имя запроса не пишем целиком: в отчёт уходят первые слова,
    // по ним видно, какой это запрос, и не утекает содержимое.
    const execFrom = Date.now();
    let tries = 0;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      if (attempt > 0) {
        // Сброс — через общее поколение: переоткрытие будет ОДНО на всех.
        this.resetIfCurrent(genAtSend);
        // Пауза в секундах, а не в миллисекундах: мосту нужно время поднять
        // новый пул, за 150 мс он не успевал и вторая попытка била в тот же
        // труп. Джиттер разводит пачку отвалившихся запросов по времени.
        await sleep(400 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250));
      }
      genAtSend = this.gen;
      tries++;
      try {
        const result = (await sendOnce()) as {
          content?: Array<{ text?: string }>;
        };
        const t = result?.content?.[0]?.text ?? "[]";
        if (t.startsWith("Error:") && isStalePoolError(t)) {
          lastErr = new Error(t.slice(7).trim());
          continue; // MCP вернул «pool closed» текстом → ещё попытка
        }
        text = t;
        lastErr = null;
        break;
      } catch (e) {
        const msg = (e as Error).message || "";
        // 5xx от прокси — та же транзиентная беда, что и «pool is closed»:
        // портал рвёт SSE-сессию, Caddy отдаёт 502, и запрос, попавший в это
        // окно, падал БЕЗ повтора. Игрок видел «MCP POST 502», а в бою это
        // означало снятую энергию без урона. Обрыв сокета — оттуда же.
        const recoverable =
          msg.includes("no session path") ||
          msg.includes("SSE closed") ||
          msg.includes("MCP timeout") ||
          msg.includes("MCP POST 4") ||
          msg.includes("MCP POST 5") ||
          /socket connection was closed|Unable to connect|fetch failed|ECONNRESET/i.test(msg) ||
          isStalePoolError(msg);
        lastErr = e as Error;
        if (!recoverable) throw e;
        // иначе — следующая попытка цикла
      }
    }
    const execMs = Date.now() - execFrom;
    notePerf("бд: запрос", execMs, {
      error: !!lastErr,
      note: `${tries > 1 ? `попыток ${tries} · ` : ""}${sqlLabel(finalSql)}`,
    });
    if (lastErr) {
      // Молчать здесь нельзя: запрос уже исчерпал все попытки и сейчас уйдёт
      // игроку ошибкой. Раньше такие провалы в логи не попадали вовсе, и
      // «не зачислилось» было нечем объяснить.
      console.warn(
        `[mcp] запрос не прошёл за ${MAX_TRIES} попытки: ${lastErr.message} · ${finalSql.slice(0, 120)}`,
      );
      throw lastErr;
    }
    if (text.startsWith("Error:")) {
      throw new Error(text.slice(7).trim());
    }
    if (!text.startsWith("[")) {
      return [];
    }
    return unwrapRows(safePyReprToJson(text), opts);
  }
}

function parseSseEvent(chunk: string): { event?: string; data: string } {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
  }
  return { event, data: dataLines.join("\n") };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Python-repr → JSON парсер. postgres-mcp возвращает результаты SELECT
// как str(list_of_dicts): ключи/строки в одинарных или двойных кавычках
// в зависимости от содержимого (Python repr выбирает: если в строке есть
// апостроф → "..." с двойными; если двойная → '...' с одинарными; если
// оба → '...' с \\'-escape). Также None/True/False вместо null/true/false.
// Числа/null/bool вне строк — литералы; внутри строк — текст.
//
// Делаем токен-уолк со state quote_char. Внутри строки уважаем backslash-
// escape (\\n, \\t, \\', \\", \\\\) и парный одинарный (''→') для надёжности.
function safePyReprToJson(s: string): unknown[] {
  let out = "";
  let i = 0;

  function consumeString(quote: string) {
    // Открывающую кавычку уже пропустили; пишем JSON-строку в двойных.
    out += '"';
    while (i < s.length) {
      const c = s[i];
      // Backslash-escape
      if (c === "\\") {
        const n = s[i + 1] ?? "";
        if (n === "'") {
          // \' → литерал ' (для JSON не нужен escape)
          out += "'";
          i += 2;
          continue;
        }
        if (n === '"') {
          out += '\\"';
          i += 2;
          continue;
        }
        if (n === "\\") {
          out += "\\\\";
          i += 2;
          continue;
        }
        if (n === "n" || n === "t" || n === "r" || n === "b" || n === "f") {
          out += "\\" + n;
          i += 2;
          continue;
        }
        if (n === "u") {
          // JSON-валидный \uXXXX — пробрасываем как есть.
          out += "\\u";
          i += 2;
          continue;
        }
        if (n === "x") {
          // Python \xHH (2 hex digits) → JSON \u00HH (JSON не понимает \x).
          // Это и ловил юзер: NFT с NBSP (\xa0) или другими спецсимволами
          // в title/description ломал JSON.parse.
          const hex = (s[i + 2] ?? "") + (s[i + 3] ?? "");
          if (/^[0-9a-fA-F]{2}$/.test(hex)) {
            out += "\\u00" + hex;
            i += 4;
            continue;
          }
          // Битый \x — пропускаем как литерал
          out += "x";
          i += 2;
          continue;
        }
        if (n === "U") {
          // Python \UHHHHHHHH (8 hex digits, code point > 0xFFFF).
          // Если в BMP (старшие 4 hex = 0000) — режем до \uHHHH.
          // Иначе суррогатная пара.
          const hex = s.slice(i + 2, i + 10);
          if (/^[0-9a-fA-F]{8}$/.test(hex)) {
            const cp = parseInt(hex, 16);
            if (cp <= 0xffff) {
              out += "\\u" + hex.slice(4);
            } else {
              // Суррогатная пара
              const v = cp - 0x10000;
              const hi = 0xd800 + ((v >> 10) & 0x3ff);
              const lo = 0xdc00 + (v & 0x3ff);
              out +=
                "\\u" +
                hi.toString(16).padStart(4, "0") +
                "\\u" +
                lo.toString(16).padStart(4, "0");
            }
            i += 10;
            continue;
          }
          out += "U";
          i += 2;
          continue;
        }
        if (n === "a" || n === "v" || n === "0") {
          // \a (bell), \v (vtab), \0 (null) — заменяем на \uXXXX
          const codes: Record<string, string> = {
            a: "\\u0007",
            v: "\\u000b",
            "0": "\\u0000",
          };
          out += codes[n];
          i += 2;
          continue;
        }
        // Прочий backslash — стираем
        out += n;
        i += 2;
        continue;
      }
      // Закрывающая кавычка того же типа
      if (c === quote) {
        // Postgres-style: '' внутри 'строки' = ' литерал
        if (quote === "'" && s[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        // Конец строки
        i++;
        out += '"';
        return;
      }
      // Внутри одинарной строки двойная кавычка должна стать \"
      // Внутри двойной строки одинарная остаётся как есть
      if (c === '"' && quote === "'") {
        out += '\\"';
        i++;
        continue;
      }
      // Контрольные символы
      if (c === "\n") {
        out += "\\n";
        i++;
        continue;
      }
      if (c === "\r") {
        out += "\\r";
        i++;
        continue;
      }
      if (c === "\t") {
        out += "\\t";
        i++;
        continue;
      }
      out += c;
      i++;
    }
  }

  function isIdent(c: string | undefined): boolean {
    return !!c && /[a-zA-Z0-9_]/.test(c);
  }

  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"') {
      i++;
      consumeString(c);
      continue;
    }
    if (s.startsWith("None", i) && !isIdent(s[i + 4])) {
      out += "null";
      i += 4;
      continue;
    }
    if (s.startsWith("True", i) && !isIdent(s[i + 4])) {
      out += "true";
      i += 4;
      continue;
    }
    if (s.startsWith("False", i) && !isIdent(s[i + 5])) {
      out += "false";
      i += 5;
      continue;
    }
    out += c;
    i++;
  }

  // Decimal("123.45") → 123.45 (от postgres-mcp для numeric колонок без row_to_json)
  const cleaned = out.replace(/Decimal\("([0-9.\-]+)"\)/g, "$1");

  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    throw new Error(
      `safePyReprToJson failed: ${(e as Error).message}; head=${s.slice(0, 200)}`
    );
  }
}

// Singleton per process (warm function)
let _session: McpSession | null = null;
export function mcpSession(): McpSession {
  if (!_session) _session = new McpSession();
  return _session;
}

/**
 * Короткий путь к базе — только на сервере и только один раз за процесс.
 * `null` означает «нет и не будет»: в браузере этого модуля не существует.
 */
type DirectModule = typeof import("./directPg");
let directMod: DirectModule | null | undefined;
async function loadDirect(): Promise<DirectModule | null> {
  if (directMod !== undefined) return directMod;
  // import.meta.env.SSR — не просто проверка, а ГРАНИЦА СБОРКИ: в клиентском
  // бандле vite подставляет сюда false, и всё внутри вырезается вместе с
  // импортом драйвера. Обычное `typeof window` этого не даёт — ветка мёртвая,
  // а pg всё равно уезжает игроку.
  if (!import.meta.env?.SSR || !process.env.DIRECT_DATABASE_URL) {
    directMod = null;
    return null;
  }
  try {
    directMod = await import("./directPg");
  } catch {
    directMod = null;
  }
  return directMod;
}

/**
 * Развернуть строки в то, что ждёт вызывающий: при wrapJson/wrapJsonCte каждая
 * строка приезжает одной колонкой `_row` с JSON внутри. Общая для обоих путей —
 * иначе прямой канал и мост отдавали бы разное.
 */
function unwrapRows(rows: unknown[], opts?: { wrapJson?: boolean; wrapJsonCte?: boolean }): unknown[] {
  if (!opts?.wrapJson && !opts?.wrapJsonCte) return rows;
  return rows.map((r) => {
    const v = (r as { _row: unknown })._row;
    if (typeof v === "string") {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }
    return v;
  });
}

/**
 * Короткая метка запроса для отчёта: вид операции и таблица. Целиком SQL в
 * отчёт не кладём — в нём попадаются кошельки и суммы.
 */
function sqlLabel(sql: string): string {
  const flat = sql.replace(/\s+/g, " ").trim();
  const kind = /^(with|select|insert|update|delete)/i.exec(flat)?.[1]?.toUpperCase() ?? "SQL";
  const table = /(?:from|into|update|join)\s+(yuplink\.[a-z_]+)/i.exec(flat)?.[1] ?? "";
  return `${kind} ${table}`.trim();
}

export async function mcpExec(
  sql: string,
  opts?: { wrapJson?: boolean; wrapJsonCte?: boolean }
): Promise<unknown[]> {
  keepWarm();
  return mcpSession().exec(sql, opts);
}

/**
 * Держать канал к базе тёплым.
 *
 * Мост закрывает сессию сам по себе (в логах — сотни «SSE closed» за час), и
 * следующий запрос платил за полный хендшейк: открыть поток, дождаться
 * endpoint, initialize, initialized — и только потом SQL. Хендшейк попадал
 * прямо в шаг игрока, а если мост в этот момент пересоздавал пул, сверху
 * ложились повторы с паузами. Отсюда «несколько секунд на шаг».
 *
 * Лёгкий SELECT раз в двадцать секунд держит сессию живой, а если она всё же
 * умерла — восстанавливает ЗАРАНЕЕ, между ходами, а не под пальцем игрока.
 * Таймер живёт только в серверном процессе и не мешает ему завершиться.
 */
const WARM_EVERY_MS = 20_000;
let warmTimer: ReturnType<typeof setInterval> | null = null;

function keepWarm(): void {
  if (warmTimer || typeof setInterval !== "function") return;
  warmTimer = setInterval(() => {
    // Ошибку глотаем намеренно: это профилактика, а не запрос за данными.
    mcpSession()
      .exec("SELECT 1;", { wrapJson: true })
      .catch(() => {});
  }, WARM_EVERY_MS);
  // unref есть только в Node: пинг не должен держать процесс живым.
  (warmTimer as unknown as { unref?: () => void }).unref?.();
}
