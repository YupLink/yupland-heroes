// Модуль карты бета-рейда
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { dropActiveMapCache, myMapId } from "./encounter-where";
import { packCells } from "./packCells";
import { mapBase } from "./map-base";
import { coreCells, regionCells } from "./map-scope";
import { loadDefeated, loadMapObjects } from "./map-objects";
import { loadRunners } from "./runners";
import { overlayRunners } from "./map-runners";
import { cellRoadId } from "./map-roads";
import { buildAssetDicts } from "./map-assets";
import { canIgnoreVoid } from "./voidGate";
import { playerCell } from "./encounter-where";
import { sanitizeVoidCells, keepById, dropHiddenKeys } from "./voidSanitize";
import { loadTownHallIds } from "./town-resolve";
import { skinDisplayName } from "@/lib/skinName";

// ─── Получить активную карту бета-рейда ───

export const getBetaRaidMap = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        /**
         * «core» — разведанное + круг вокруг героя; «full» — вся карта (админ,
         * дальние маршруты); «region» — только клетки в радиусе вокруг камеры
         * (cq,cr): карта грузится кусками по обзору, а не вся (53k) разом.
         */
        scope: z.enum(["core", "full", "region"]).optional().default("full"),
        /** Центр камеры и радиус для scope="region" (в гексах). */
        cq: z.number().int().optional(),
        cr: z.number().int().optional(),
        radius: z.number().int().min(4).max(60).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ data }): Promise<any> => {
      // Кошелёк нужен не для доступа, а для объёма ответа: игроку зона едет
      // пустой, админу — целиком (он её и рисует).
      const wallet = await requireBetaRaid();
      const seesVoid = canIgnoreVoid(wallet);
      // Схема города ДО первого SELECT'а: loadTownHallIds читает raid_town, а
      // без таблицы ратуши на карте молча пропадали бы. Ровно это случилось
      // после этапа 1: миграция town-01 была в репо, но на прод не поехала.
      const { ensureTownSchema } = await import("./town-resolve");
      await ensureTownSchema();
      // 1. Карта ИГРОКА (мультикарта): он видит ту, на которой стоит. Пока все на
      // активной — myMapId вернёт её же, поэтому для текущих игроков это no-op.
      const playerMap = await myMapId(wallet);
      const mapRows = (await mcpExec(
        `SELECT rm.id, rm.name, rm.size FROM yuplink.raid_maps rm
       WHERE rm.id = ${sqlStr(playerMap)}
       LIMIT 1;`,
        { wrapJson: true },
      )) as Array<{ id: string; name: string; size: number }>;

      const map = mapRows?.[0];
      if (!map)
        return {
          map: null,
          terrains: {},
          objects: {},
          decorations: {},
          roads: {},
          packed: null,
          buildings: {},
          buildingTiers: {},
          doors: [] as string[],
        };

      // Убитые/собранные >5с — физически чистим клетку и hp (ленивая уборка,
      // раз в 30с на карту): иначе наборы defeated/expired растут вечно и полл
      // пухнет. Сброс кэша внутри — mapBase ниже перечитает уже без них.
      const { sweepDeadObjects } = await import("./dead-sweep");
      await sweepDeadObjects(map.id).catch(() => {});

      // 2. Тяжёлая, общая для всех часть — из кэша (map-base): клетки, словари
      // и тиры построек одинаковы для каждого игрока, и раньше их выбирал из
      // базы каждый вход на карту. Кэш SWR: протухшее отдаётся сразу, свежее
      // подъезжает фоном; правка админа сбрасывает снимок явно.
      const baseSnap = await mapBase(map.id);
      // Ядро режем ДО всего остального: словари, упаковка и постройки считаются
      // уже по оставшимся клеткам, поэтому лишние имена и картинки в ответ тоже
      // не едут. Админу режем только по просьбе — карту он рисует целиком.
      // region режем по камере (клиентский viewport), core — по разведанному,
      // остальное (админ/дальние маршруты) — целиком.
      const wantRegion = data.scope === "region" && !seesVoid && data.cq != null && data.cr != null;
      const wantCore = data.scope === "core" && !seesVoid;
      // Что повержено и кто бегает — нужны до упаковки; беглецов грузим ЗДЕСЬ,
      // чтобы их клетки попали в регион всегда (их десятки, и беглец у края
      // обзора не должен пропадать: overlayRunners кладёт беглеца только на
      // клетку, попавшую в ответ).
      const [dead, runners] = await Promise.all([loadDefeated(map.id), loadRunners(map.id)]);
      const cellRows = wantRegion
        ? (() => {
            const base = regionCells({
              cells: baseSnap.cells,
              center: { q: data.cq!, r: data.cr! },
              radius: data.radius ?? 30,
            });
            const inRegion = new Set(base.map((c) => `${c.q},${c.r}`));
            const runnerKeys = new Set(runners.map((rn) => `${rn.q},${rn.r}`));
            const extra = baseSnap.cells.filter(
              (c) => runnerKeys.has(`${c.q},${c.r}`) && !inRegion.has(`${c.q},${c.r}`),
            );
            return extra.length ? [...base, ...extra] : base;
          })()
        : wantCore
          ? await coreCells({
              wallet,
              mapId: map.id,
              cells: baseSnap.cells,
              at: await playerCell(wallet).catch(() => null),
            })
          : baseSnap.cells;
      const terrainRows = baseSnap.terrains;
      const objectRows = baseSnap.objects;
      const decorRows = baseSnap.decorations;
      const roadRows = baseSnap.roads;

      // Ссылка в никуда объектом не считается. Шаблон удалили, снимка на клетке
      // нет — показать нечего, а клетка при этом оставалась непроходимой: карта
      // рисовала тёмный кружок вместо картинки (betaCanvasDraw), пройти нельзя
      // (hexPassable), тапнуть тоже (useAdjacentObject ищет объект в словаре).
      // Обрываем ссылку здесь, одним местом на отрисовку, проход и карточку.
      const knownObjects = new Set((objectRows ?? []).map((o) => o.id));
      const liveCells = (cellRows ?? []).map((c) => {
        if (!c.object_id) return c;
        // Ссылка в никуда ИЛИ убитый/собранный >5с — объект с клетки снимаем:
        // не рисуем, клетка проходима. Так карта чистится и меньше грузится.
        if (!knownObjects.has(c.object_id) || dead.expired.has(`${c.q},${c.r}`))
          return { ...c, object_id: null };
        return c;
      });

      // Зачистка до упаковки: у клеток под куполом игроку не остаётся ничего,
      // кроме координат и самого признака «здесь глухо». Заодно отваливается и
      // «повержен» — его packCells ставит только там, где остался object_id.
      // Беглецы ложатся на клетки ДО зачистки: под куполом клетка уезжает пустой
      // вместе с ними, а словари строятся уже по упакованному (map-runners).
      const overlay = overlayRunners({
        rows: liveCells,
        runners,
        known: knownObjects,
        deadCells: dead.cells,
        deadRunners: dead.runners,
      });
      const { cells, hiddenKeys } = sanitizeVoidCells(overlay.cells, seesVoid);
      // Ратуши карты — коротким сетом координат, чтобы packCells отметил их
      // индексы в townHalls (клиент по ним рисует будущее окно города).
      // ensureTownSchema уже отработал в начале handler'а.
      const hallKeys = await loadTownHallIds(map.id).catch(() => new Set<string>());
      // Дорога у клетки ОДНА, и разбор общий с редактором (map-roads.cellRoadId):
      // из старой склейки оба берут последний id — иначе прод и админка снова
      // показывали бы разные дороги на одних и тех же клетках.
      const packed = packCells(
        cells,
        cellRoadId,
        (key) => overlay.defeatedKeys.has(key),
        (key) => overlay.runnerKeys.has(key),
        (key) => hallKeys.has(key),
      );

      // Постройки: шаблоны с цепочкой тиров; сами тиры клеток уже в снимке.
      const { skinKey } = await import("./building-skins");
      const { loadBuildingTemplates } = await import("./buildings");
      const buildingList = await loadBuildingTemplates(map.id);
      const tierRows = baseSnap.buildingTiers;
      // Шаблоны и тиры грузятся по всей карте — отсекаем по упакованным клеткам
      // и координатам зоны, иначе постройка из тумана уедет именем и картинкой.
      const buildings: Record<string, { id: string; name: string; tiers: unknown[] }> = {};
      for (const b of keepById(buildingList, packed.buildingIds)) buildings[b.id] = b;
      // Облики: в пул клетки уехал `skin:<id>`, значит и в словаре он должен
      // быть — иначе клетка со сменённым видом осталась бы без картинки. Тиры
      // берём у базового шаблона, подменяя картинку: механика прежняя, вид свой.
      const { skinIdOf, skinsByIds } = await import("./building-skins");
      const skinIds = packed.buildingIds.map(skinIdOf).filter((v): v is string => !!v);
      if (skinIds.length > 0) {
        const cellTemplate = new Map<string, string>();
        for (const c of cells) {
          if (c.building_skin_id && c.building_id) {
            cellTemplate.set(String(c.building_skin_id), String(c.building_id));
          }
        }
        const byId = new Map(buildingList.map((b) => [b.id, b]));
        for (const skin of await skinsByIds(skinIds)) {
          const base = byId.get(cellTemplate.get(skin.id) ?? "");
          const tiers = (base?.tiers ?? [{ name: skin.name, imageUrl: skin.image }]).map((t) => ({
            ...(t as Record<string, unknown>),
            imageUrl: skin.image,
          }));
          // Имя облика, если оно осмысленное («Ворота единорога»); мусорное
          // числовое имя файла («1000031099») откатывается на имя базовой
          // постройки («Ворота»). Картинку всегда даёт облик. Одно правило с
          // карточкой игрока (building-action.loadCellBuilding).
          buildings[skinKey(skin.id)] = {
            id: skinKey(skin.id),
            name: skinDisplayName(skin.name, base?.name),
            tiers,
          };
        }
      }
      const buildingTiers = dropHiddenKeys(tierRows, hiddenKeys);

      // Клетки-двери: по ним игрок платит за проход, поэтому клиент обязан их
      // знать — маршрут через дверь не строится, чтобы плата не списывалась
      // молча посреди длинного пути. Список идёт вместе с картой: он маленький,
      // а отдельный запрос стоил бы рейса на каждое открытие карты.
      const { loadDoorCells } = await import("./gate-cells");
      const doors = (await loadDoorCells(map.id)).filter((k) => !hiddenKeys.has(k));

      // Словари строим по санитизированному набору: id, которого нет ни на одной
      // видимой клетке, не должен приезжать ни именем, ни meta (у босса — HP и
      // reward_tiers).
      const { terrains, objects, decorations, roads } = buildAssetDicts({
        terrainRows: keepById(terrainRows, packed.terrainIds),
        objectRows: keepById(objectRows, packed.objectIds),
        decorRows: keepById(decorRows, packed.decorationIds),
        roadRows: keepById(roadRows, packed.roadIds),
      });

      return {
        map,
        terrains,
        objects,
        decorations,
        roads,
        packed,
        buildings,
        buildingTiers,
        doors,
        /** Ядро это или вся карта — клиент по нему решает, догружать ли остальное. */
        scope: wantRegion ? ("region" as const) : wantCore ? ("core" as const) : ("full" as const),
      };
    },
  );

// ─── Установить активную карту бета-рейда (admin) ───

export const adminSetBetaRaidMap = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ mapId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    await mcpExec(
      // Значение — через JSON и sqlStr (аудит 11.11.2026: id шёл в SQL как есть).
      `INSERT INTO yuplink.settings (key, value)
       VALUES ('beta_raid_map', ${sqlStr(JSON.stringify({ mapId: data.mapId }))})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
      { wrapJson: false },
    );
    // Активную карту держат в памяти процесса (encounter-where): без сброса
    // рейд бы ещё полминуты ходил по старой.
    dropActiveMapCache();
    return { ok: true, mapId: data.mapId };
  });
