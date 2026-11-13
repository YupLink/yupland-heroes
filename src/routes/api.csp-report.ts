// Отчёты защитного заголовка (lib/csp/cspPolicy.ts): браузер присылает, что
// он заблокировал бы (режим наблюдения) или заблокировал. Храним сводно —
// директива, источник (только адрес сайта, без пути), страница (без запроса) —
// чтобы решить, можно ли включать блокировку. Без входа: так шлёт браузер.
import { createFileRoute } from "@tanstack/react-router";

const MAX_BODY = 8 * 1024;

type Report = Record<string, unknown>;

/** Источник без пути и запроса: «inline», «eval» или адрес сайта. */
export function blockedOf(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  if (!s || s === "inline" || s === "eval" || s === "wasm-eval") return s || "inline";
  try {
    return new URL(s).origin;
  } catch {
    return s.slice(0, 40);
  }
}

/** Страница без запроса и якоря. */
export function pageOf(v: unknown): string {
  try {
    return new URL(String(v)).pathname.slice(0, 120);
  } catch {
    return "?";
  }
}

export const Route = createFileRoute("/api/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { readCapped } = await import("@/server/perf/bearer");
        const text = await readCapped(request, MAX_BODY);
        if (!text) return new Response(null, { status: 204 });
        let r: Report = {};
        try {
          const body = JSON.parse(text) as { "csp-report"?: Report } | Report[];
          r = (Array.isArray(body) ? (body[0]?.body as Report) : body["csp-report"]) ?? {};
        } catch {
          return new Response(null, { status: 204 });
        }
        const { getRequestHeader } = await import("@tanstack/react-start/server");
        const ip = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() || "-";
        try {
          const { rateGate } = await import("@/server/rateGate");
          await rateGate(`csp:${ip}`, { limit: 30, windowMs: 60_000 });
        } catch {
          return new Response(null, { status: 204 });
        }
        const directive = String(r["effective-directive"] ?? r["violated-directive"] ?? "?")
          .split(" ")[0]
          .slice(0, 40);
        const blocked = blockedOf(r["blocked-uri"] ?? r.blockedURL);
        // Окна кошельков (iframe srcdoc) присылают отчёт без адреса страницы — тогда файл скрипта.
        const page = pageOf(r["document-uri"] ?? r.documentURL ?? r["source-file"] ?? r.sourceFile);
        const { mcpExec } = await import("@/server/db/mcpClient");
        const { sqlStr } = await import("@/server/api/raid-shared");
        const key = `${directive}|${blocked}|${page}`;
        await mcpExec(
          `INSERT INTO yuplink.csp_report_agg (key, directive, blocked, page)
           VALUES (${sqlStr(key)}, ${sqlStr(directive)}, ${sqlStr(blocked)}, ${sqlStr(page)})
           ON CONFLICT (key) DO UPDATE SET n = yuplink.csp_report_agg.n + 1, last_at = now();`,
        ).catch(() => {});
        return new Response(null, { status: 204 });
      },
    },
  },
});
