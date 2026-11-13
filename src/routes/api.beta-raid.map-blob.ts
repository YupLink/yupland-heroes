// Карта целиком — двоичным снимком (lib/raid/mapCodec), а не текстом через
// server-функцию. Один и тот же буфер для всех игроков одной версии; сжат
// заранее (gzip), Caddy его не трогает. ETag = версия: клиент с той же
// версией получает 304 и ничего не качает.
import { createFileRoute } from "@tanstack/react-router";

/**
 * Поколение сборки снимка — в метке. Поменялась СБОРКА (а не версия карты:
 * 07.10 облик ратуши без тиров давал серый квадрат) — старая метка больше не
 * совпадает, и браузер не подсунет из своего кэша прежний снимок по 304.
 * g3 (20.10): в снимке список шахт (packed.mines) — вместе с mapCache GEN=3,
 * иначе 304 отдал бы снимок без шахт и он осел бы в новом ключе IndexedDB.
 * g4 (21.10): в снимке список жил золота и алмазов (lists.veins) — вместе с
 * mapCache GEN=4.
 * g5 (21.10): жилы перерисованы гнёздами (minev2-31), версия карты та же —
 * вместе с mapCache GEN=5, иначе 304 вернул бы снимок со старыми жилами.
 * g6 (23.10): новая картинка золотого гриба (облик в базе) — вместе с mapCache
 * GEN=6, иначе 304 вернул бы снимок со старой картинкой.
 */
const ASSEMBLY_GEN = 6;

export const Route = createFileRoute("/api/beta-raid/map-blob")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { mapRequester, snapshotFor } = await import("@/server/api/beta-raid/map-serve");
        const { traced } = await import("@/server/perf/trace");
        let who: Awaited<ReturnType<typeof mapRequester>>;
        try {
          who = await mapRequester();
        } catch (e) {
          return new Response((e as Error).message, { status: 401 });
        }
        if (!who.map) return new Response("no map", { status: 404 });
        const snap = await traced("карта: blob", () => snapshotFor(who.map!, who.admin));
        // Карта в метке обязательна: у этажей свои версии, и одинаковый номер
        // версии двух этажей отдал бы игроку, перешедшему порталом, «304 — у
        // тебя актуальная» на карту прежнего этажа.
        const etag = `W/"${who.map.id}-${snap.revision}-${snap.variant}-g${ASSEMBLY_GEN}"`;
        const headers: Record<string, string> = {
          etag,
          "x-map-revision": String(snap.revision),
          "cache-control": "private, no-cache",
          vary: "accept-encoding, cookie",
        };
        if (request.headers.get("if-none-match") === etag) {
          return new Response(null, { status: 304, headers });
        }
        const gzip = /\bgzip\b/.test(request.headers.get("accept-encoding") ?? "");
        const body = gzip ? snap.gz : snap.raw;
        return new Response(body as unknown as BodyInit, {
          status: 200,
          headers: {
            ...headers,
            "content-type": "application/octet-stream",
            "content-length": String(body.byteLength),
            ...(gzip ? { "content-encoding": "gzip" } : {}),
          },
        });
      },
    },
  },
});
