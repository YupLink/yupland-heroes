// Живой канал бета-рейда: сервер сам сообщает клиентам об изменениях.
//
// Раньше карта узнавала о забранной монетке только из опроса раз в 20 секунд —
// игрок видел чужой уже собранный лут и шёл к пустой клетке. Теперь тот, кто
// забрал объект или сходил, публикует событие, и все открытые карты обновляются
// в тот же миг.
//
// Хаб живёт в памяти процесса: приложение крутится одним контейнером, этого
// достаточно. Если инстансов станет больше — сюда заходит Redis/Postgres
// LISTEN-NOTIFY, а интерфейс publish/subscribe останется прежним.

import { getCurrentWallet } from "./auth";
import { Client } from "pg";
import { noteEvent, noteFanout, noteListeners } from "./perf/hubStats";
import type { CellPatch, MapDelta } from "@/lib/raid/mapDelta";

/**
 * Насколько изменился флот на клетке: судов и занятых из них.
 *
 * Событие «ships» без этих подробностей означает «перечитай список причалов» —
 * так его и шлют редкие места (верфь, кисть админа). А шаг по воде идёт пачкой
 * по десятку в минуту, и там подробности решают: сосед двигает иконку у себя в
 * кэше и НЕ идёт за списком на каждый гребок.
 */
export type ShipCellDelta = {
  q: number;
  r: number;
  ships?: number;
  busy?: number;
  /** Большой ли корабль приехал на клетку — сосед рисует его своим артом. */
  big?: boolean;
};

/**
 * Карта события. Событие одного этажа игроку на другом ни к чему, а наложенное
 * на его карту путало миры (жалоба 07.10.2026): добитый в главном мире босс
 * гасил объект в тех же координатах этажа, чужой побег переписывал клетки,
 * чужой шаг двигал лагерь. Поток (routes/api.beta-raid.events.ts) и клиент
 * (useRaidLiveStream) не применяют событие чужой карты. null — касается всех
 * карт сразу (поменялся шаблон, а он общий).
 */
export type RaidEvent = RaidEventBody & { mapId: string | null };

type RaidEventBody =
  // `runner` — погас не объект клетки, а спрятавшийся под ним беглец
  // (runners.ts): гаснут они по отдельности, и списки у клиента разные.
  // `reveal` — кто открылся под забранным объектом: беглец, который до сих пор
  // прятался за ним (runner-reveal). Без этого клетка у игрока просто гасла, и
  // спрятавшийся гриб выглядел «побеждённым автоматом» вместе с укрытием.
  | {
      type: "defeated";
      cells: string[];
      runner?: boolean;
      reveal?: { cell: string; objectId: string };
    }
  | { type: "restored" }
  // `mine` — задета шахта или её охрана: только тогда клиент перечитывает
  // охрану шахт (раньше перечитывал на каждую постройку — ~10 запросов в
  // минуту на игрока, 14.10.2026).
  | { type: "built"; cells: string[]; mine?: boolean }
  // Мешочки на клетках изменились (выпал, забрали, закопали, выкопали, истёк):
  // содержимого нет — кто рядом, перечитывает мешочки своего «второго обзора».
  // scope 'chest' — переложили в обычном сундуке: слой мешочков не менялся.
  | { type: "bags"; cells: string[]; scope?: "chest" }
  | { type: "ships"; cells?: ShipCellDelta[] }
  // Шаг игрока: откуда и куда (клетками, без имени). Соседи двигают точку у
  // себя в кэше, не перечитывая раскладку игроков на каждый чужой шаг.
  | { type: "moved"; from?: { q: number; r: number } | null; to?: { q: number; r: number } | null }
  // Объект убежал с клетки `from` на клетку `to` — на две клетки прочь. Идёт
  // ВСЕМ, включая того, чей шаг его спугнул: свою фигурку игрок рисует сам, а
  // вот уехавшую цель — нет, и без события он шёл бы к пустому месту.
  // `patches` — правда обеих клеток из базы (flee-move): клиент кладёт её как
  // есть, а не угадывает по from/to; `via` — промежуточная клетка для стрелки.
  | {
      type: "fled";
      from: string;
      to: string;
      objectId: string;
      via?: string;
      layer?: 0 | 1;
      patches?: CellPatch[];
    }
  // Дельта карты (map-journal): версия и что именно изменилось. Клиент правит
  // свои колонки на месте; `full` — карту перестроили, брать новый снимок.
  | ({ type: "map"; mapId: string } & MapDelta);

/**
 * Событие с меткой автора. Метка нужна ровно затем, чтобы не будить того, кто
 * событие и вызвал: свой шаг игрок уже нарисовал у себя, а перечитывание
 * раскладки игроков или причалов — это несколько походов в БД на КАЖДЫЙ шаг.
 * Наружу метка не уходит: поток отдаёт её отрезанной
 * (routes/api.beta-raid.events.ts).
 */
export type RaidWireEvent = RaidEvent & { by?: string | null };

type Listener = (event: RaidWireEvent) => void;

/** globalThis — чтобы горячая перезагрузка в dev не плодила вторые хабы. */
const hub: { listeners: Set<Listener> } = ((
  globalThis as unknown as { __raidLive?: { listeners: Set<Listener> } }
).__raidLive ??= { listeners: new Set<Listener>() });

export function subscribeRaid(listener: Listener): () => void {
  hub.listeners.add(listener);
  noteListeners(hub.listeners.size);
  return () => {
    hub.listeners.delete(listener);
    noteListeners(hub.listeners.size);
  };
}

/**
 * Кто вызвал событие. Читаем сами, а не просим у вызывающих: publishRaid зовут
 * из десятка мест, и все они уже внутри запроса своего игрока. Позвали вне
 * запроса (крон, фоновая задача) — метки просто не будет, и событие уйдёт всем,
 * как и раньше.
 */
function author(): string | null {
  try {
    return getCurrentWallet();
  } catch {
    return null;
  }
}

/** Раздать событие локальным SSE-подписчикам этого процесса. */
function fanout(wire: RaidWireEvent): void {
  // Отправки считаем здесь, а не у издателя: событие с соседнего воркера
  // приходит через NOTIFY и раздаётся своим подписчикам этим же кодом.
  noteFanout(hub.listeners.size);
  for (const listener of hub.listeners) {
    try {
      listener(wire);
    } catch {
      /* один отвалившийся слушатель не должен ломать рассылку */
    }
  }
}

// ─── Кросс-процессный мост (Postgres LISTEN/NOTIFY) ───
//
// В кластере SSE-подписчики живут на РАЗНЫХ воркерах: событие с воркера A само
// по себе не дойдёт до игрока на воркере B, и беглецы/бои у соседей застыли бы.
// Поэтому publish раздаёт локально СРАЗУ (мгновенно своим) и шлёт NOTIFY —
// прочие воркеры ловят его через LISTEN и раздают уже своим. Своё эхо
// отбрасываем по метке воркера, чтобы не задвоить.
//
// БЕЗОПАСНО НА ОТКАЗ: нет DIRECT_DATABASE_URL или соединение упало — работаем
// как раньше, в пределах процесса; кросс-воркерные события подхватит опрос
// (playerDots, раз в 60с). Хуже single-process не станет.
const WORKER_ID = `${process.pid}-${Math.floor(Math.random() * 1e6)}`;
const CHANNEL = "raid_live";
let notifyClient: Client | null = null;
let bridgeReady = false;
let connecting = false;

function scheduleReconnect(): void {
  setTimeout(() => {
    void ensureBridge();
  }, 5000);
}

async function ensureBridge(): Promise<void> {
  if (bridgeReady || connecting) return;
  const url = process.env.DIRECT_DATABASE_URL;
  if (!url) return; // fallback: только локальная раздача
  connecting = true;
  try {
    const c = new Client({ connectionString: url });
    await c.connect();
    await c.query(`LISTEN ${CHANNEL}`);
    c.on("notification", (msg) => {
      if (!msg.payload) return;
      try {
        const parsed = JSON.parse(msg.payload) as { w: string; e: RaidWireEvent };
        if (parsed.w === WORKER_ID) return; // своё эхо — уже раздали локально
        fanout(parsed.e);
      } catch {
        /* битый payload игнорируем */
      }
    });
    c.on("error", () => {
      bridgeReady = false;
      notifyClient = null;
      scheduleReconnect();
    });
    notifyClient = c;
    bridgeReady = true;
  } catch {
    notifyClient = null;
    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

// Поднимаем мост при загрузке модуля (раз на воркер). Ошибку глотаем — fallback.
void ensureBridge();

export function publishRaid(event: RaidEvent): void {
  const wire: RaidWireEvent = { ...event, by: author() };
  // Счётчик нагрузки канала (perf/hubStats): событий по типам.
  noteEvent(event.type);
  // Своим — мгновенно, не дожидаясь круга через БД.
  fanout(wire);
  // Другим воркерам — через NOTIFY. NOTIFY ограничен ~8000 байт: наши события
  // мелкие (ключи клеток), но на всякий случай не шлём заведомо большое.
  if (bridgeReady && notifyClient) {
    let payload = JSON.stringify({ w: WORKER_ID, e: wire });
    // Дельта карты не влезла (раздача тысяч клеток): соседям уходит одна
    // версия без правок — их клиенты сами спросят журнал с своей версии.
    if (Buffer.byteLength(payload) >= 7900 && wire.type === "map") {
      payload = JSON.stringify({
        w: WORKER_ID,
        e: { type: "map", mapId: wire.mapId, rev: wire.rev, by: wire.by },
      });
    }
    if (Buffer.byteLength(payload) < 7900) {
      notifyClient.query(`SELECT pg_notify('${CHANNEL}', $1)`, [payload]).catch(() => {
        // Соединение отвалилось между проверкой и запросом — перецепимся.
        bridgeReady = false;
        notifyClient = null;
        scheduleReconnect();
      });
    }
  }
}

export const raidListenerCount = () => hub.listeners.size;
