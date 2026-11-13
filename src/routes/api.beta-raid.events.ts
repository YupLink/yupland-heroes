// Поток событий карты рейда (SSE): забранный лут, дельты карты и перемещения
// приходят клиентам сразу, без опроса.
//
// Пачками и по области. Раньше каждое событие уходило каждому подписчику
// отдельной записью в сокет, и каждый чужой шаг заставлял всех перечитывать
// раскладку игроков. Теперь: события копятся 250 мс и уезжают одним
// сообщением-массивом; шаги и побеги дальше RADIUS клеток от игрока ему не
// шлём вовсе — на его экране их нет. Дельты карты идут всем всегда: по ним
// клиент держит свою копию карты в актуальной версии.
import { createFileRoute } from "@tanstack/react-router";
import { subscribeRaid, type RaidWireEvent } from "@/server/raidLive";
import { getCurrentWallet } from "@/server/auth";
import { hexDistance } from "@/lib/raid/hex";
import { sanitizeDeltaForPlayer } from "@/lib/raid/mapDelta";
import { SIGHT_MAX } from "@/lib/raid/sight";
import { foreignFloor } from "@/lib/raid/liveFloor";

/** Через сколько копящиеся события уезжают одним сообщением. */
const BATCH_MS = 250;
/** Дальше этого от героя чужие шаги и побеги подписчику не нужны. */
const RADIUS = 40;
/**
 * Мешочки видно во «втором обзоре»: событие о них — только тем, кто его видит
 * (+1 на шаг). Обзор у подписчика бывает и с биноклем (40, lib/raid/sight) —
 * сигнал без клеток, лишний раз перечитать слой дешевле, чем не увидеть.
 */
const BAG_RADIUS = SIGHT_MAX + 1;

type Cell = { q: number; r: number };

/** Событие адресное (шаг, побег, мешочек): показывать только тем, кто рядом. */
function anchorOf(e: RaidWireEvent): Cell | null {
  if (e.type === "moved") return e.to ?? e.from ?? null;
  const key =
    e.type === "fled" ? e.to : e.type === "bags" && e.cells.length === 1 ? e.cells[0] : "";
  const [q, r] = key ? key.split(",").map(Number) : [NaN, NaN];
  return Number.isFinite(q) && Number.isFinite(r) ? { q, r } : null;
}

export const Route = createFileRoute("/api/beta-raid/events")({
  server: {
    handlers: {
      GET: async () => {
        // Поток отдаёт координаты забранного лута и построек. Без этой строки
        // его слушал кто угодно из интернета, ни разу не зайдя в игру.
        const me = getCurrentWallet();
        if (!me) return new Response("unauthorized", { status: 401 });
        // Где стоит подписчик — для фильтра по области. Дальше обновляется по
        // его же шагам из потока, без походов в базу.
        let center: Cell | null = null;
        // Этаж подписчика: события других этажей ему не шлём (накладка миров,
        // 07.10.2026). Обновляется по его же переходам из потока.
        let floor: string | null = null;
        let admin = false;
        // Аккаунт подписчика: личные события («шахту отняли») — только ему.
        let account: string | null = null;
        try {
          const { ownCell, myMapId } = await import("@/server/api/beta-raid/encounter-where");
          const { canIgnoreVoid } = await import("@/server/api/beta-raid/voidGate");
          const { accAccountId } = await import("@/server/api/currency/move");
          admin = canIgnoreVoid(me);
          [center, floor, account] = await Promise.all([
            ownCell(me),
            myMapId(me).catch(() => null),
            accAccountId(me).catch(() => null),
          ]);
        } catch {
          center = null;
        }
        const encoder = new TextEncoder();
        let unsubscribe: (() => void) | null = null;
        let ping: ReturnType<typeof setInterval> | null = null;
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        let batch: RaidWireEvent[] = [];

        const stream = new ReadableStream({
          start(controller) {
            const send = (data: string) => {
              try {
                controller.enqueue(encoder.encode(data));
              } catch {
                /* клиент уже ушёл */
              }
            };
            const flush = () => {
              flushTimer = null;
              if (batch.length === 0) return;
              // Метку автора наружу не отдаём — это кошелёк. Дельты карты
              // игроку — без содержимого клеток под глухим туманом.
              const out = batch.map((e) => {
                const wire = { ...e, by: undefined };
                return !admin && wire.type === "map" ? sanitizeDeltaForPlayer(wire) : wire;
              });
              batch = [];
              send(`data: ${JSON.stringify(out)}\n\n`);
            };
            send(": connected\n\n");
            // Центр области и этаж — заново из базы (перенос без координат).
            const reread = () =>
              void import("@/server/api/beta-raid/encounter-where")
                .then((m) => Promise.all([m.ownCell(me), m.myMapId(me)]))
                .then(([c, f]) => {
                  if (c) center = c;
                  if (f) floor = f;
                })
                .catch(() => {});
            unsubscribe = subscribeRaid((event) => {
              // Личное «шахту отняли» — только своему аккаунту и без адресата.
              if (event.type === "mineLost") {
                if (!account || event.to !== account) return;
                batch.push({ ...event, to: undefined });
                if (!flushTimer) flushTimer = setTimeout(flush, BATCH_MS);
                return;
              }
              // Личное «тебя отнесли в город» (синий динамит взорвал корабль): перенёс
              // чужой бросок — этаж и центр области заново из базы, как после портала.
              if (event.type === "sentHome") {
                if (!account || event.to !== account) return;
                reread();
                batch.push({ ...event, to: undefined });
                if (!flushTimer) flushTimer = setTimeout(flush, BATCH_MS);
                return;
              }
              // Свой шаг: двигаем центр области и не пересылаем — свою фигурку
              // клиент нарисовал сам; свой флот — тоже.
              if (event.type === "moved" && event.by === me) {
                if (event.to) center = event.to;
                // Перенос без координат (портал, «домой», корабль) — центр
                // области и этаж перечитываем из базы, иначе они остались бы
                // прежними и события фильтровались бы по ним.
                else reread();
                return;
              }
              // Событие другого этажа — не этому подписчику: наложенное на его
              // карту, оно гасило и двигало объекты в тех же координатах.
              if (foreignFloor(event.mapId, floor)) return;
              if (event.type === "ships" && event.by === me) return;
              const at = anchorOf(event);
              const near = (far: number) =>
                !!at && !!center && hexDistance(center.q, center.r, at.q, at.r) <= far;
              // Мешочки — только тем, кто рядом, и без клеток: сигнал «перечитай
              // свой обзор». Координаты чужой добычи (и на неразведанном, и под
              // куполом) игроку не уходят; где стоит подписчик, неизвестно — не шлём.
              if (
                event.type === "bags" ? !admin && !near(BAG_RADIUS) : at && center && !near(RADIUS)
              )
                return;
              batch.push(event.type === "bags" && !admin ? { ...event, cells: [] } : event);
              if (!flushTimer) flushTimer = setTimeout(flush, BATCH_MS);
            });
            // Прокси рвут тихие соединения — держим их короткой строкой-пингом.
            ping = setInterval(() => send(": ping\n\n"), 25_000);
          },
          cancel() {
            unsubscribe?.();
            if (ping) clearInterval(ping);
            if (flushTimer) clearTimeout(flushTimer);
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache, no-transform",
            connection: "keep-alive",
            "x-accel-buffering": "no",
          },
        });
      },
    },
  },
});
