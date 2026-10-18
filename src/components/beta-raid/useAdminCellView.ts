// Что стоит на клетке — глазами админа и БЕЗ ожидания сервера.
//
// Раньше окно клетки спрашивало состав у базы, а невыгруженные правки кисти
// живут только в кэше карты: поставил табличку — окно показывало «Постройка —»
// и текст вписать было негде. Теперь состав берём из того же кэша, что рисует
// карту (правки в нём уже применены), а сервер досылает то, чего в карте нет:
// жив ли объект, кто на клетке стоит и какие настройки уже сохранены.
//
// Одно исключение — вода: по ней сервер решает, можно ли спустить корабль, и
// про свежий мазок кистью он ещё не знает. Поэтому воду считаем ТОЛЬКО по его
// ответу, а локальную показываем отдельно и честно.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBetaRaidShips } from "@/server/api/beta-raid/ship-action";
import { getBetaRaidPlayers } from "@/server/api/beta-raid/players";
import { getAdminCell } from "@/server/api/beta-raid/admin-live-read";
import {
  buildingEffect,
  cellBuildingEffect,
  signText,
  type BuildingEffect,
} from "@/lib/buildingEffect";
import { isWaterName } from "@/lib/shipRules";
import { readCellDetails, type CellPatch } from "./patchMapCache";
import { shipsAtCell, type ShipsData } from "./patchShipsCache";
import { useAssets } from "./AdminCellPalette";
import { composeCellObjects, type AdminCellObject, type AdminCellRunner } from "./adminCellObject";
import { useMapProgressive } from "./useMapProgressive";

export type AdminCellComposed = {
  q: number;
  r: number;
  terrain: { id: string; name: string } | null;
  /** Местность правили кистью и ещё не выгрузили — сервер видит другую. */
  terrainQueued: boolean;
  /**
   * Клетка под куполом глухого тумана. Свойство КЛЕТКИ, а не её местности:
   * под куполом лежит настоящая земля со своей ценой хода и всем, что на ней
   * построено, — купол только закрывает её от игрока.
   */
  voidFog: boolean;
  road: { id: string; name: string } | null;
  decoration: { id: string; name: string } | null;
  object: AdminCellObject | null;
  /**
   * Беглец на клетке (server runners.ts): объект своего слоя. Слоем клетки он
   * НЕ является — правки клетки его не трогают, и убирается он своей кнопкой.
   */
  runner: AdminCellRunner | null;
  building: {
    id: string;
    /** id облика клетки (без префикса «skin:») или null — базовый вид шаблона. */
    skinId: string | null;
    /** Имя надетого облика — карандаш редактора именно его правит. */
    skinName: string | null;
    /** Настоящий building_id без облика — для «база» (снять облик, оставить постройку). */
    baseId: string | null;
    name: string;
    /** Имя базовой постройки (без склейки с расой облика) — для окна редактора. */
    baseName: string;
    tier: number;
    /** Сколько тиров у шаблона; 0 — узнать неоткуда, «+» тогда не даём. */
    tiers: number;
    effect: BuildingEffect;
    /** Текст таблички: сначала невыгруженный, потом сохранённый. */
    text: string;
    /** Текст лежит в очереди правок — его ещё предстоит выгрузить. */
    textQueued: boolean;
    /** Сырой конфиг постройки (для настройки шахты в режиме бога). */
    config: Record<string, unknown> | null;
  } | null;
  /** Сколько судов у этого берега. */
  ships: number;
  /** Вода по ПОДТВЕРЖДЁННОМУ сервером составу — только туда он пустит корабль. */
  water: boolean;
  /** Водой клетка выглядит только у нас: мазок не выгружен или сервер молчит. */
  waterLocalOnly: boolean;
  players: string[];
  /** Подробности с сервера ещё едут: состав уже виден, живость — нет. */
  loading: boolean;
  /** Сервер состав не отдал: показанное — догадка по кэшу карты. */
  failed: boolean;
  /** Спросить состав ещё раз. */
  retry: () => void;
};

/** Имя только что поставленного ассета: в словарях карты его ещё нет, в палитре — есть. */
function fromPalette(
  list: Array<{ id: string; name: string }> | undefined,
  id: string,
): string | null {
  return list?.find((a) => a.id === id)?.name ?? null;
}

export function useAdminCellView(
  q: number,
  r: number,
  /** Невыгруженная правка этой клетки — из неё берём настройки. */
  queued: CellPatch | undefined,
): AdminCellComposed {
  const qc = useQueryClient();
  // Те же ключи и настройки, что у экрана рейда: запрос не повторится, а
  // данные придут из кэша — вместе с невыгруженными правками кисти.
  // Тот же запрос, что у экрана рейда (снимок + дельты): второй раз не пойдёт.
  const mapQ = useMapProgressive();
  const shipsQ = useQuery({
    queryKey: ["beta-raid-ships"],
    queryFn: () => getBetaRaidShips(),
    staleTime: 10_000,
  });
  const srvQ = useQuery({
    queryKey: ["admin-cell", q, r],
    queryFn: () => getAdminCell({ data: { q, r } }),
    staleTime: 2_000,
    retry: false,
  });
  // Живой список добытых клеток — тот же ключ и те же настройки, что у карты
  // (playerDots): лишнего запроса не будет, данные придут из кэша.
  const liveQ = useQuery({
    queryKey: ["beta-raid-players"],
    queryFn: () => getBetaRaidPlayers(),
    staleTime: 10_000,
  });

  const map = mapQ.data;
  const d = readCellDetails(map as never, q, r);
  const srv = srvQ.data;
  // Показанный объект принадлежит слою беглецов — значит в самой клетке пусто.
  const runnerId = d.runner ? d.objectId : null;
  const cellObjectId = d.runner ? null : d.objectId;
  // Серверные подробности годятся, только если слой с тех пор не переставили.
  const sameObject = !!cellObjectId && srv?.object?.id === cellObjectId;
  // У клетки С ОБЛИКОМ ключ постройки в кэше карты — «skin:<id>», а сервер знает
  // её настоящий building_id. Прямое сравнение всегда давало false, и окно
  // откатывало сохранённые поведение/конфиг к «как в шаблоне»: админ настроил →
  // зашёл снова → пусто (жалоба владельца «настроил, сохранил, опять ничего»).
  // Скин — это и есть та же постройка сервера, поэтому доверяем его данным.
  const skinnedCell = typeof d.buildingId === "string" && d.buildingId.startsWith("skin:");
  const sameBuilding =
    !!d.buildingId && !!srv?.building && (srv.building.id === d.buildingId || skinnedCell);

  // Живость объекта — ОДИН источник на всё окно: живой список. Снимок карты
  // живёт пять минут, и окно писало «жив» про добытого час назад босса; кисть
  // же берёт метку из живого списка (useAdminBrush.read), поэтому «погасить»
  // считалось «вернулось как было» и молча вылетало из очереди.
  // Слоёв на клетке два, и гаснут они порознь: беглец спрашивает свой список.
  const liveDead = d.runner ? liveQ.data?.defeatedRunners : liveQ.data?.defeated;
  const defeated = liveDead ? liveDead.includes(`${q},${r}`) : d.defeated;
  // Объект на клетке не тот, что знает сервер, — свежий мазок кистью. Отметка
  // о смерти уйдёт вместе с прежним объектом, новый встаёт живым.
  const freshObject =
    !!cellObjectId && !sameObject && (srvQ.isSuccess || queued?.objectId !== undefined);

  // Справочник построек: у свежей, ещё не выгруженной постройки карта не знает
  // ни имени, ни числа тиров — а он знает и то, и другое.
  const bldQ = useAssets("building", !!d.buildingId);
  const bldAsset = d.buildingId ? bldQ.data?.find((a) => a.id === d.buildingId) : undefined;

  const palette = (kind: string) =>
    qc.getQueryData<Array<{ id: string; name: string }>>(["admin-live-assets", kind]);

  const terrainName = d.terrainId
    ? (map?.terrains?.[d.terrainId]?.name ??
      fromPalette(palette("terrain"), d.terrainId) ??
      d.terrainId)
    : null;

  // Купол: сначала невыгруженная правка, потом кэш карты — он уже содержит
  // мазки кисти, поэтому только что накрытая клетка так и подписана, не
  // дожидаясь «Выгрузить». Ответ сервера остаётся запасным на случай карты из
  // старого кэша, где колонки купола ещё нет.
  // Через `||` серверный ответ умел только ДОБАВИТЬ купол и никогда убрать:
  // после «снять» окно ещё показывало «под куполом», пока летел рефетч
  // ["admin-cell"]. Спрашиваем сервер только когда колонки купола в кэше карты
  // нет вовсе — то есть карта пришла из старого суточного кэша.
  const mapKnowsDome = Array.isArray(map?.packed?.voidFog);
  const voidFog = queued?.voidFog ?? (mapKnowsDome ? d.voidFog : srv?.voidFog === true);

  const objectName = (raw: string): string => {
    const known = map?.objects?.[raw]?.name;
    if (known) return known;
    const [kind, id] = raw.includes(":") ? raw.split(":") : ["chest", raw];
    return fromPalette(palette(kind), id) ?? raw;
  };

  // Имя постройки. У клетки со скином d.buildingId — это ключ облика
  // «skin:<id>», а не настоящий building_id: в шапке окна и на подписи карты
  // так и вылезало «skin:bskin_…», а buildingCategory ничего не находил и
  // «+ картинки» становился disabled. Достаём настоящее имя из query-cache
  // групп облика: у каждой группы есть templateId базовой постройки; по нему
  // ищем имя в палитре построек. Иначе — имя самой группы (там уже категория).
  const skinsCache = skinnedCell
    ? qc.getQueryData<{
        groups: Array<{
          id: string;
          name: string;
          templateId: string | null;
          skins: Array<{ id: string; name: string; image: string }>;
        }>;
      }>(["admin-building-skins"])
    : undefined;
  const skinGroup = skinsCache?.groups?.find((g) =>
    g.skins.some((s) => `skin:${s.id}` === d.buildingId),
  );
  const skinTemplateName = skinGroup?.templateId
    ? (qc
        .getQueryData<Array<{ id: string; name: string }>>(["admin-live-assets", "building"])
        ?.find((b) => b.id === skinGroup.templateId)?.name ?? null)
    : null;
  const rawName = d.buildingId
    ? (map?.buildings?.[d.buildingId]?.name ?? bldAsset?.name ?? d.buildingId)
    : "";
  const name = skinnedCell
    ? (srv?.building?.name ?? skinTemplateName ?? skinGroup?.name ?? rawName)
    : rawName;
  // Число тиров: карта → палитра → ответ сервера. Ноль означает «неизвестно»,
  // поэтому проверяем каждый источник, а не берём первый непустой через ??.
  const tiers =
    map?.buildings?.[d.buildingId ?? ""]?.tiers?.length ||
    bldAsset?.tiers ||
    (sameBuilding ? srv!.building!.tiers : 0);
  const queuedText = queued?.buildingConfig ? signText(queued.buildingConfig) : null;

  // Оба объектных слоя клетки считает общий разбор (adminCellObject).
  const layers = composeCellObjects({
    cellObjectId,
    runnerId,
    defeated,
    fresh: freshObject,
    srv,
    sameObject,
    queued,
    nameOf: objectName,
    objects: map?.objects,
  });

  // Корабль сервер ставит по СВОЕЙ местности. Пока он не подтвердил воду,
  // кнопку не обещаем: свежий мазок кистью он ещё не видел и откажет.
  const water = isWaterName(srvQ.isSuccess ? (srv?.terrain?.name ?? null) : null);

  return {
    q,
    r,
    terrain: d.terrainId ? { id: d.terrainId, name: terrainName ?? d.terrainId } : null,
    terrainQueued: srvQ.isSuccess && d.terrainId !== (srv?.terrain?.id ?? null),
    voidFog,
    // Имя свежей дороги: карта про неё ещё не знает, палитра — знает. Без
    // этого только что положенная дорога подписывалась своим id.
    road: d.roadId
      ? {
          id: d.roadId,
          name: map?.roads?.[d.roadId]?.name ?? fromPalette(palette("road"), d.roadId) ?? d.roadId,
        }
      : null,
    decoration: d.decorationId
      ? {
          id: d.decorationId,
          name:
            map?.decorations?.[d.decorationId]?.name ??
            fromPalette(palette("decoration"), d.decorationId) ??
            d.decorationId,
        }
      : null,
    ...layers,
    building: d.buildingId
      ? {
          id: d.buildingId,
          // Скин клетки — id облика без префикса «skin:». Пикер обликов по нему
          // подсвечивает текущий и открывается на нужной категории, а не на
          // первой попавшейся (жалоба «на карте один визуал, подходишь — другой»).
          skinId: skinnedCell ? d.buildingId!.slice(5) : null,
          // Имя КОНКРЕТНОГО облика — карандаш в шапке правит именно его,
          // не имя базы. Достаём из группы облика: у неё есть точный skins[].
          skinName: skinnedCell
            ? (skinGroup?.skins.find((s) => `skin:${s.id}` === d.buildingId)?.name ?? null)
            : null,
          // Настоящий building_id (без облика) — пикеру для «база»: снять облик и
          // вернуть базовый вид, не тронув саму постройку. У клетки с обликом в
          // bld лежит «skin:<id>», поэтому базу берём из черновика/ответа сервера.
          baseId: skinnedCell
            ? (queued?.buildingId ?? srv?.building?.id ?? skinGroup?.templateId ?? null)
            : d.buildingId,
          name,
          // Имя БАЗОВОЙ постройки — для строки «Постройка» в редакторе. Склейка
          // «Ферма вихоток» нужна игроку (карта/карточка), а админу в окне видно,
          // ЧТО за постройка на самом деле, иначе имя скачет с каждым обликом.
          baseName: skinnedCell ? (srv?.building?.name ?? skinTemplateName ?? name) : name,
          tier: d.tier,
          tiers,
          // Пока сервер молчит, эффект угадываем по названию — иначе поле
          // «послание героям» у свежей таблички появлялось бы только после
          // выгрузки. Придёт ответ — он и станет главным.
          // Назначенное клетке поведение показываем сразу, не дожидаясь
          // выгрузки: админ выбрал «Грядка» — форма грядки должна открыться.
          effect:
            cellBuildingEffect(
              queued?.buildingConfig ?? (sameBuilding ? srv!.building!.config : null),
              null,
              name,
            ) ?? (sameBuilding ? srv!.building!.effect : buildingEffect(null, name)),
          text: queuedText ?? (sameBuilding ? srv!.building!.text : ""),
          textQueued: queuedText !== null,
          config:
            queued?.buildingConfig !== undefined
              ? (queued.buildingConfig ?? null)
              : sameBuilding
                ? ((srv!.building!.config as Record<string, unknown> | null) ?? null)
                : null,
        }
      : null,
    ships: shipsAtCell(shipsQ.data as ShipsData, q, r),
    water,
    waterLocalOnly: !water && isWaterName(terrainName),
    players: srv?.players ?? [],
    loading: srvQ.isLoading,
    failed: srvQ.isError,
    retry: () => void srvQ.refetch(),
  };
}
