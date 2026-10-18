// Свой fetch для server-функций TanStack Start.
//
// ЗАЧЕМ: пока приложение перезапускается после выката, Caddy отдаёт 502/503 с
// пустым телом и БЕЗ заголовка content-type. Клиентский фетчер TanStack на
// такой ответ зовёт invariant() без аргументов
// (@tanstack/start-client-core/dist/esm/client-rpc/serverFnFetcher.js) — в DEV
// рядом лежит осмысленный текст, а в прод-сборке он вырезан, и до игрока
// доезжало голое «Invariant failed»: ошибка, которая не называет ни вызов, ни
// статус, ни причину. Здесь мы перехватываем ровно те же случаи на шаг раньше
// библиотеки и бросаем ошибку, которая сама себя объясняет.
//
// КАК ПОДКЛЮЧЕНО: createStart({ serverFns: { fetch } }) в src/start.ts.
// createClientRpc читает getStartOptions()?.serverFns?.fetch и передаёт его в
// serverFnFetcher вместо глобального fetch. Работает ТОЛЬКО на клиенте: при
// SSR server-fn зовётся напрямую, без сети.
//
// ВАЖНО: обычный путь не трогаем. Пропускаем как есть сырые/потоковые ответы
// (x-tss-raw), framed-протокол, json (в нём приезжают и редиректы, и notFound,
// и сериализованные ошибки самих server-fn) и валидные не-json ответы функций,
// возвращающих Response. Иначе поломали бы штатные сценарии ради диагностики.

import { probeLearnName } from "@/lib/perf/clientProbe";

const CT_FRAMED = "application/x-tss-framed";
const CT_JSON = "application/json";

/**
 * Метка в тексте ошибки. По ней humanError() (src/lib/humanError.ts) узнаёт
 * транспортный сбой и показывает игроку «Сервис обновляется», а не техтекст.
 * Менять — только вместе с DEPLOY_MARKERS там.
 */
export const SERVER_FN_TRANSPORT_MARKER = "server-fn transport";

export class ServerFnTransportError extends Error {
  readonly status: number;
  readonly contentType: string | null;

  constructor(opts: {
    method: string;
    target: string;
    status: number;
    statusText: string;
    contentType: string | null;
    reason: string;
  }) {
    const ct = opts.contentType ? `content-type: ${opts.contentType}` : "no content-type";
    const status = `${opts.status}${opts.statusText ? " " + opts.statusText : ""}`;
    super(
      `${SERVER_FN_TRANSPORT_MARKER}: ${opts.method} ${opts.target} -> ${status}, ${ct} (${opts.reason})`,
    );
    this.name = "ServerFnTransportError";
    this.status = opts.status;
    this.contentType = opts.contentType;
  }
}

/** framed или json — форматы, которые фетчер TanStack умеет разобрать. */
function isReadable(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.includes(CT_FRAMED) || contentType.includes(CT_JSON);
}

/**
 * Имя вызванной server-fn вместо километрового id. В id зашит base64 с путём
 * модуля и именем экспорта — из него видно, ЧТО не ответило («getSession»),
 * а это половина диагноза. Формат id — деталь сборки, поэтому под try/catch:
 * не разобрали — отдаём укороченный путь, ошибка всё равно осмысленная.
 */
function describeTarget(rawUrl: string): string {
  const url = typeof rawUrl === "string" ? rawUrl : String(rawUrl);
  const id = url.split("/_serverFn/")[1]?.split("?")[0] ?? "";
  if (!id) return url.slice(0, 120);
  try {
    const b64 = id.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const meta = JSON.parse(atob(padded)) as { file?: string; export?: string };
    const fn = (meta.export ?? "").replace(/_createServerFn_handler$/, "");
    const file = (meta.file ?? "").split("/").pop()?.split("?")[0] ?? "";
    if (fn) return file ? `${fn} (${file})` : fn;
  } catch {
    /* id не base64-JSON (другая схема сборки) — падаем в фолбэк ниже */
  }
  return `/_serverFn/${id.slice(0, 32)}`;
}

/**
 * Фетчер server-функций. Сигнатура совместима с globalThis.fetch (CustomFetch).
 */
export async function serverFnFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  // Проба нагрузки (lib/perf/clientProbe) учит имя функции по заголовку
  // x-fn: сам адрес — хэш, а в отчёте нужен «getBetaRaidMap».
  probeLearnName(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    res.headers.get("x-fn"),
  );

  // Порядок проверок повторяет getResponse() библиотеки — иначе перехватим
  // не тот случай.
  if (res.headers.get("x-tss-raw") === "true") return res;

  const contentType = res.headers.get("content-type");
  const method = init?.method ?? "GET";
  const target = describeTarget(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  const fail = (reason: string) =>
    new ServerFnTransportError({
      method,
      target,
      status: res.status,
      statusText: res.statusText,
      contentType,
      reason,
    });

  // Ответ без типа: шлюз оборвал соединение или приложение перезапускается.
  // Здесь библиотека звала invariant() → «Invariant failed».
  if (!contentType) {
    throw fail("server did not answer with a body, likely restarting or proxied 5xx");
  }

  // Штатный путь: framed / json — включая редиректы, notFound и ошибки самих
  // server-fn (они приезжают сериализованными и должны долететь как есть).
  if (isReadable(contentType)) return res;

  // Заголовок сериализации есть, а формат не наш: ответ обрезан или подменён
  // прокси/вебвью. Второй invariant() библиотеки.
  if (res.headers.get("x-tss-serialized")) {
    throw fail("serialized response arrived in an unexpected format");
  }

  // Не сериализованный и не ok: библиотека бросила бы Error(await text()), а у
  // страницы-заглушки прокси тело пустое — получалась ошибка без текста.
  if (!res.ok) throw fail("server returned an error page instead of a result");

  // Валидный не-json ответ: server-fn вернула сырой Response (csv, текст).
  return res;
}
