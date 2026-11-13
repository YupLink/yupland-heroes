// Подписка на живые события карты: забранный лут и перемещения приходят
// сразу, без ожидания следующего опроса.
//
// Опрос остаётся страховкой на случай, если поток оборвётся (прокси, сон
// вкладки, мобильная сеть), но интервал у него редкий — обычно всё приходит
// потоком.
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { applyShipDeltas, type ShipCellDelta, type ShipsData } from "./patchShipsCache";
import { voidKeys, type PackedCells } from "./unpackMap";
import { handleDefeated } from "./liveDefeated";
import type { Reveal } from "./applyReveal";
import { handleFled, type FledWire } from "./liveFled";
import { useT } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { probeEvent } from "@/lib/perf/clientProbe";
import { applyLiveDelta, hasRevision, MAP_KEY } from "./useMapProgressive";
import { foreignFloor } from "@/lib/raid/liveFloor";
import { HARVEST_KEY, handleMineLost } from "./hud/useHarvest";
import { MINE_OFFICE_KEY } from "@/lib/mineOfficeBus";
import { cellsTouchMyMines, type MineCell } from "@/lib/mineCellsTouch";
import { DOOR_TOLLS_KEY } from "./useDoorTolls";
import { chestLiveKeys } from "./chest/chestLive";
import { bagEventKeys, bagEventNear } from "./loot-bag/lootBagLive";
import { movePlayerDot } from "./movePlayerDot";
import { mineLifeTouched, MINE_LIFE_KEY } from "./mine-life/mineLifeStore";
import { handleMineBlast } from "./mine-blast/mineBlastLive";
import { handleSentHome } from "./dynamite/sentHomeLive";
import type { MapDataV } from "./mapBlob";
import type { CellPatch, MapDelta, MapDeltaAssets } from "@/lib/raid/mapDelta";

/** Кэш цен дверей — здесь нужны только ключи клеток. */
type DoorTollsCache = { doors?: Record<string, unknown> };

type LiveData = {
  cells: Array<{ q: number; r: number; count: number; online: number }>;
  defeated: string[];
  defeatedRunners: string[];
  expired?: string[];
};

/** Событие потока: у «built» в cells ключи клеток, у «ships» — правки флота. */
type WireEvent = FledWire & {
  type?: string;
  cells?: Array<string | ShipCellDelta>;
  /** «fled»: откуда, куда и кто убежал — ключами клеток «q,r» (liveFled);
   *  «moved»: клетками. */
  from?: string | { q: number; r: number } | null;
  to?: string | { q: number; r: number } | null;
  /** «defeated»: кто открылся под добитым верхним (server runner-reveal). */
  reveal?: Reveal | null;
  mine?: boolean; // «built»: задета шахта — перечитать охрану
  owner?: boolean; // «built»: шахта сменила владельца (поломка/починка) — флажки всем
  /** Этаж события (у всех событий); null — касается всех карт. */
  mapId?: string | null;
  /** «map»: дельта карты — версия и правки клеток (lib/raid/mapDelta). */
  rev?: number;
  full?: boolean;
  patches?: CellPatch[];
  assets?: MapDeltaAssets;
};

/** Пауза, за которую чужие события собираются в один рефетч. */
const COALESCE_MS = 1200;

const cellKeys = (cells: WireEvent["cells"]): string[] =>
  (cells ?? []).filter((c): c is string => typeof c === "string");

const shipDeltas = (cells: WireEvent["cells"]): ShipCellDelta[] =>
  (cells ?? []).filter((c): c is ShipCellDelta => typeof c === "object" && c !== null);

export function useRaidLiveStream(): void {
  const qc = useQueryClient();
  // Сервер отбрасывает СВОИ события по кошельку сессии, снятому при открытии
  // потока (routes/api.beta-raid.events.ts). Кошелёк внутри аккаунта меняется
  // без перезахода («SAME-ACCOUNT switch» в user-auth), и поток со старым «я»
  // возвращал автору его же гребки и шаги — двойные дельты флота и метка на
  // своей клетке. Смена кошелька переоткрывает поток (см. зависимости эффекта).
  const wallet = useAppStore((s) => s.walletAddress);
  // useT() — НОВАЯ функция на каждый рендер: в зависимостях пересоздавала бы поток. В ref.
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    // В dev поток не открываем: локальный сервер работает по HTTP/1.1, где на
    // адрес приходится всего шесть соединений, и постоянный поток занимает одно
    // из них. В проде (HTTP/2 за Caddy) такого ограничения нет.
    if (import.meta.env.DEV) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    /** Сколько раз подряд не удалось подключиться — на этом растёт пауза. */
    let fails = 0;

    /**
     * Чужие события идут очередью: в людном рейде это десятки в минуту, а
     * каждое перечитывание раскладки игроков или причалов — несколько походов в
     * БД (один со сплошным перебором). Склеиваем пачку в один рефетч: чужие
     * фигурки всё равно ползут по клетке за раз, и секунда задержки незаметна.
     */
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    // Карту и живой список всегда с "all": во вкладке админа они бывают
    // неактивны, и без этого свежие правки соседа не долетали до кэша.
    const REFRESH_ALL = new Set([
      "beta-raid-map",
      "beta-raid-players",
      "beta-raid-ships",
      "beta-raid-mine-guards",
    ]);
    const refetchSoon = (key: string) => {
      if (timers.has(key)) return; // рефетч уже назначен — пачка едет одним запросом
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          void qc.invalidateQueries({
            queryKey: [key],
            refetchType: REFRESH_ALL.has(key) ? "all" : undefined,
          });
        }, COALESCE_MS),
      );
    };

    /**
     * Клетка под глухим туманом: чужой флот там нам не показывают вовсе
     * (server ships.visibleShipCells прячет такие причалы). Патч вслепую
     * дорисовал бы судно за стеной — а корабль стоит только на воде, и это
     * готовая разведка местности. Админу купол не преграда, ему патчим всё.
     */
    const hidden = (d: ShipCellDelta): boolean => {
      const session = qc.getQueryData(["session"]) as { isAdmin?: boolean } | undefined;
      if (session?.isAdmin === true) return false;
      const map = qc.getQueryData(["beta-raid-map"]) as { packed?: PackedCells } | undefined;
      const dome = voidKeys(map?.packed);
      return dome.size > 0 && dome.has(`${d.q},${d.r}`);
    };

    const connect = () => {
      if (closed) return;
      source = new EventSource("/api/beta-raid/events");

      // Первое сообщение — соединение живое, счётчик неудач в ноль. События идут
      // ПАЧКОЙ (массив раз в 250 мс); одиночный объект тоже принимаем.
      source.onmessage = (e) => {
        fails = 0;
        let parsed: unknown;
        try {
          parsed = JSON.parse(e.data);
        } catch {
          return;
        }
        const events = (Array.isArray(parsed) ? parsed : [parsed]) as WireEvent[];
        for (const event of events) handle(event);
      };

      /**
       * Дельты карты применяются по очереди: версия N+1 ждёт, пока ляжет N,
       * иначе две дельты подряд наложились бы на один и тот же старый кэш.
       * Кладём функцией от ТЕКУЩЕГО кэша (MapMerge): пока журнал ждал сеть,
       * туда легли побеги и добитые — их нельзя затереть снятой до ожидания
       * картой.
       */
      let mapChain: Promise<void> = Promise.resolve();
      const applyMap = (delta: MapDelta & { mapId?: string }) => {
        mapChain = mapChain
          .then(async () => {
            const cur = qc.getQueryData<MapDataV>(MAP_KEY);
            if (!cur || !hasRevision(cur)) return;
            const merge = await applyLiveDelta(cur, delta);
            qc.setQueryData(MAP_KEY, (latest?: MapDataV) => merge(latest ?? cur));
          })
          .catch(() => {});
      };

      const handle = (event: WireEvent) => {
        probeEvent(event.type ?? "?");
        if (handleMineLost(qc, event)) return; // личное «шахту отняли» (useHarvest)
        if (handleSentHome(qc, event)) return; // личное «отнесли в город» (динамит)
        // Событие другого этажа: поток их отсекает, но этаж подписчика узнаёт с задержкой (портал) — не прикладываем.
        if (foreignFloor(event.mapId, qc.getQueryData<MapDataV>(MAP_KEY)?.mapId)) return;
        if (handleMineBlast(event)) return; // взрыв шахт динамитом — анимация (mine-blast)
        if (event.type === "map") {
          if (typeof event.rev !== "number") return;
          applyMap({
            mapId: event.mapId,
            rev: event.rev,
            ...(event.full
              ? { full: true as const }
              : { patches: event.patches, assets: event.assets }),
          } as MapDelta & { mapId?: string });
          return;
        }
        if (event.type === "defeated") {
          // Погасить добитое (по слою: объект клетки или беглец) и показать
          // открывшегося под ним беглеца — сразу, не дожидаясь дельты «map».
          handleDefeated(qc, event);
          return;
        }
        // Мешочки: слой и окно перечитываем, только если задет мой «второй обзор».
        if (event.type === "bags") {
          if (bagEventNear(qc, cellKeys(event.cells)))
            for (const k of bagEventKeys(event)) refetchSoon(k);
          return;
        }
        if (event.type === "fled") {
          // Объект ушёл на соседнюю клетку: карта, стрелка, туман, тост (liveFled).
          handleFled(qc, event, tRef.current);
          return;
        }
        if (event.type === "built") {
          // Карту НЕ перекачиваем: клетки приходят дельтой «map». Снимаем
          // только окна затронутых построек и охрану шахт (если событие о шахте).
          const cells = cellKeys(event.cells);
          if (cells.length) {
            for (const key of cells) {
              const [q, r] = key.split(",").map(Number);
              if (Number.isFinite(q) && Number.isFinite(r)) {
                qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
              }
            }
          } else {
            qc.invalidateQueries({ queryKey: ["beta-raid-building"] });
          }
          if (event.mine || !cells.length) refetchSoon("beta-raid-mine-guards");
          if (mineLifeTouched(event, cells)) refetchSoon(MINE_LIFE_KEY[0]); // починка, режим
          // Сундуки: слой карты — только если задет сундук (гейт в chestLive), окна — всегда.
          for (const key of chestLiveKeys(qc, cells)) refetchSoon(key);
          // Задета МОЯ шахта (отбили или собрали) или шахта сменила владельца:
          // флажок и «Добыча» без F5. Гейт нужен: 'built' идёт всем на карте от
          // ~15 модулей — безусловный рефетч дал бы +20 QPS при 50 онлайн.
          const myMines = (qc.getQueryData(HARVEST_KEY) as { mines?: MineCell[] } | undefined)
            ?.mines;
          if (event.owner || cellsTouchMyMines(cells, myMines)) {
            refetchSoon("beta-raid-harvest");
            refetchSoon("beta-raid-mine-flags");
            refetchSoon(MINE_OFFICE_KEY[0]); // и окно «Управление шахтами»
          }
          // Правка настройки двери (цена, рамки уровня) приходит этим же
          // событием по её клетке: цены в плашке маршрута перечитываем, но
          // только когда задета известная дверь — тот же гейт, что у шахт.
          // Ключ цен — по карте (префикс общий): ищем любой живой кэш цен.
          const cached = qc.getQueriesData<DoorTollsCache>({ queryKey: DOOR_TOLLS_KEY });
          const known = cached.some(([, d]) => {
            const doors = d?.doors;
            return !!doors && cells.some((key) => key in doors);
          });
          if (known) refetchSoon(DOOR_TOLLS_KEY[0]);
          return;
        }
        if (event.type === "ships") {
          // Своего флота сюда не приходит — сервер его автору не шлёт
          // (routes/api.beta-raid.events.ts). Это чужие суда.
          const deltas = shipDeltas(event.cells).filter((d) => !hidden(d));
          if (deltas.length) {
            qc.setQueryData(["beta-raid-ships"], (old: unknown) =>
              applyShipDeltas(old as ShipsData, deltas),
            );
            return;
          }
          // Событие без подробностей (верфь, кисть админа) — перечитываем, но
          // пачкой: разом спущенный флот не должен давать запрос на судно.
          if (!event.cells?.length) refetchSoon("beta-raid-ships");
          return;
        }
        if (event.type === "restored") {
          // Карта пришла/придёт дельтой «map» (full → снимок); здесь — раскладка
          // игроков, причалы и СВОЯ позиция: кисть админа (вытащить застрявшего,
          // подогнать судно) двигает и её, а иначе игрок видел бы себя на старой
          // клетке до первого отклонённого шага или F5. Пачкой (refetchSoon):
          // «restored» идёт на каждый мазок кисти, серия мазков — один запрос.
          qc.invalidateQueries({ queryKey: ["beta-raid-players"], refetchType: "all" });
          refetchSoon("beta-raid-state");
          refetchSoon("beta-raid-ships");
          return;
        }
        if (event.type === "moved") {
          // Своих шагов сюда не приходит вовсе — сервер их автору не шлёт.
          // С клетками — двигаем точку в кэше сами; без них — перечитываем.
          const from = typeof event.from === "object" ? event.from : null;
          const to = typeof event.to === "object" ? event.to : null;
          if (to) {
            qc.setQueryData(["beta-raid-players"], (old: LiveData | undefined) =>
              old ? { ...old, cells: movePlayerDot(old.cells, from, to) } : old,
            );
            return;
          }
          refetchSoon("beta-raid-players");
        }
      };

      source.onerror = () => {
        source?.close();
        source = null;
        if (closed) return;
        // Поток требует сессии, и клиент без неё получает 401 на каждой
        // попытке. Прежние три секунды без счётчика давали двадцать запросов в
        // минуту с каждого такого экрана — до конца его жизни. Растущая пауза
        // с потолком в минуту оставляет переподключение живым для тех, у кого
        // просто моргнула сеть, и утихомиривает остальных.
        fails += 1;
        retry = setTimeout(connect, Math.min(3000 * 2 ** (fails - 1), 60_000));
      };
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      source?.close();
    };
  }, [qc, wallet]);
}
