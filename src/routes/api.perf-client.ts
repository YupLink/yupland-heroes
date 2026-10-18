// Приём проб с клиентов (lib/perf/clientProbe): раз в минуту телефон игрока
// присылает, как ему живётся — кадры, длинные задачи, куча, вес и время
// серверных ответов. Сюда попадает только агрегат за окно, несколько сотен
// байт; тело больше 8 КБ отвергаем не читая.
//
// Кто угодно с улицы писать не может: нужна сессия игрока. На один кошелёк —
// не чаще раза в 20 с, на процесс — не больше 300 в минуту: под тысячей
// игроков приёмник не должен превратиться в нагрузку сам.
import { createFileRoute } from "@tanstack/react-router";
import { getCurrentWallet } from "@/server/auth";
import { sanitizeSample } from "@/lib/perf/sanitizeSample";

const MAX_BYTES = 8 * 1024;
const PER_WALLET_MS = 20_000;
const PER_MINUTE = 300;

const lastByWallet = new Map<string, number>();
let minuteStart = Date.now();
let minuteCount = 0;

function allowed(wallet: string): boolean {
  const now = Date.now();
  if (now - minuteStart > 60_000) {
    minuteStart = now;
    minuteCount = 0;
    // Заодно забываем старые кошельки, чтобы Map не рос вечно.
    for (const [w, at] of lastByWallet) if (now - at > 10 * PER_WALLET_MS) lastByWallet.delete(w);
  }
  if (minuteCount >= PER_MINUTE) return false;
  const last = lastByWallet.get(wallet) ?? 0;
  if (now - last < PER_WALLET_MS) return false;
  lastByWallet.set(wallet, now);
  minuteCount++;
  return true;
}

export const Route = createFileRoute("/api/perf-client")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const wallet = getCurrentWallet();
        if (!wallet) return new Response("unauthorized", { status: 401 });
        const len = Number(request.headers.get("content-length") ?? 0);
        if (len > MAX_BYTES) return new Response("too large", { status: 413 });
        if (!allowed(wallet)) return new Response(null, { status: 204 });
        let sample: unknown;
        try {
          // Без Content-Length (chunked) тело всё равно не длиннее лимита:
          // читаем потоком и режем, а не глотаем целиком.
          const { readCapped } = await import("@/server/perf/bearer");
          const text = await readCapped(request, MAX_BYTES);
          if (text === null) return new Response("too large", { status: 413 });
          sample = JSON.parse(text);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        // В базу — только наша форма с приведёнными числами: сводка считает
        // квантили в SQL по jsonb, и кривой образец ронял бы весь отчёт.
        const clean = sanitizeSample(sample);
        if (!clean) return new Response("bad sample", { status: 400 });
        const { saveClientSample } = await import("@/server/perf/clientStore");
        // Ошибку базы игроку не показываем: проба — не игра.
        await saveClientSample(wallet, request.headers.get("user-agent"), clean).catch(() => {});
        return new Response(null, { status: 204 });
      },
    },
  },
});
