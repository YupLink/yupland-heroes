// Редактор гекс-карт v0.2 (мобильный, по ТЗ hex_map_editor_spec).
// НЕ путать с /raid-hexmap (просмотр текущей структуры рейда).
//
// v0.2 изменения (жалоба владельца 09.08 на v0.1):
//   • Форма карты: КВАДРАТ (offset-coord col/row ∈ [0..N)), а не ромб-axial.
//     Замок в центре (N/2, N/2). Как в Heroes III.
//   • Полный экран (fixed inset-0, поверх admin-layout, свой z-слой).
//   • Жесты: touchstart/move/end + pointer, pinch-zoom, drag-pan. touch-action:none.
//   • A* избегает существующих ячеек (cost=5 по занятой, 1 по пустой) —
//     новый коридор не накладывается на старый, если есть обход.
//   • Объекты: 4 сорта — монстр, босс, артефакт, сундук — тап установка.
//   • Дороги как отдельный слой (свой сет).
//   • Режимы вместо голых кнопок: Местность / Дороги / Объекты / Ластик.
//
// v0.3 остаётся: обочина автогенерация, фильтр отображения (галочки),
// сервер-таблицы maps/cells/assets, загрузка новых типов местности.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminListItems, adminUpdateItem, adminCreateItem, adminDeleteItem } from "@/api";
import { adminListBossTemplates, adminSaveBossTemplate } from "@/server/api/raid-admin";
import {
  adminListHexMaps,
  adminActiveHexMapId,
  adminLoadHexMap,
  adminSaveHexMap,
  adminDeleteHexMap,
} from "@/server/api/raid-hexmap";
import { adminSetBetaRaidMap } from "@/server/api/beta-raid/map";
import { adminListRewardTokens } from "@/server/api/boss";
import { thumb } from "@/lib/image";
import {
  RewardConfigEditor,
  type DraftConfig,
  DEF_CFG,
  toDraftCfg,
  fromDraftCfg,
} from "@/components/admin/RewardConfigEditor";
import { AbilitiesEditor } from "@/components/admin/hex-editor/AbilitiesEditor";
import { bootMapId } from "@/components/admin/hex-editor/bootMapId";
import { BossTemplateDeleteDialog } from "@/components/admin/BossTemplateDeleteDialog";
import type { AbilityCfg } from "@/server/api/beta-raid/abilities";
import { BossScene } from "@/components/game/BossScene";
import { LANDS, RACES, ARTIFACT_SLOTS, ARTIFACT_STATS } from "@/components/heroMeta";
import {
  Undo2,
  Eraser,
  Save,
  Home,
  MapPinned,
  ArrowLeft,
  Mountain,
  Route as RouteIcon,
  Sparkles,
  Folder,
  Plus,
  Trash2,
  Pencil,
  Waves,
  X,
  CloudUpload,
  Server,
  Swords,
  ChevronDown,
  Loader2,
  TreePine,
} from "lucide-react";
import { nanoid } from "nanoid";
import {
  SQRT3,
  type Axial,
  DIRS,
  key,
  parseKey,
  offsetToAxial,
  inBoundsAxial,
  axialToPixel,
  pixelToAxial,
  hexDist,
  type TerrainDef,
  OBJECT_SUBS,
  type ObjectSub,
  parseObjectId,
  type Mode,
  type Cell,
  type MapState,
  type UndoOp,
  type SavedMap,
  LIB_KEY,
  CUR_KEY,
  loadLibrary,
  persistLibrary,
  LS_KEY,
  CENTER,
  centerKey,
  hexPath,
  drawHex,
  drawHexOutline,
  withKeptSnapshot,
} from "@/components/admin/hex-editor/hexShared";
import { MapObjectEditor } from "@/components/admin/hex-editor/MapObjectEditor";
import { FullObjectEditor } from "@/components/admin/hex-editor/FullObjectEditor";
import { BuildingEditor } from "@/components/admin/hex-editor/BuildingEditor";
import {
  buildingEffect,
  chambersPricesDraft,
  signText,
  treePricesDraft,
} from "@/lib/buildingEffect";
import { mineConfigDraft, type MineConfig } from "@/lib/mineConfig";
import { portalConfig as readPortalConfig, type PortalConfig } from "@/lib/portal";
import { boostConfigDraft, type BoostCellConfig } from "@/lib/boostConfig";
import { listRewardTokens } from "@/server/api/admin-payouts";
import { BuildingCellEditor } from "@/components/admin/hex-editor/BuildingCellEditor";
import { TerrainEditor } from "@/components/admin/hex-editor/TerrainEditor";
import { ObjectTypeSelectorPopup } from "@/components/admin/hex-editor/ObjectTypeSelectorPopup";
import { humanError } from "@/lib/humanError";
import { VoidFogBrush, VOID_OFF, VOID_ON } from "@/components/admin/hex-editor/VoidFogBrush";
import { BiomeGenBrush, GEN_ON, GEN_OFF } from "@/components/admin/hex-editor/BiomeGenBrush";
import { BiomeGenPanel } from "@/components/admin/hex-editor/BiomeGenPanel";
import { generateBiome, type Patch as BiomePatch, type BiomeType } from "@/lib/biomeGenerators";
import { drawVoidDome } from "@/components/admin/hex-editor/voidFogHatch";
import { drawRoadRibbon, roadMaskAt } from "@/components/admin/hex-editor/roadRibbonPreview";
import { RoadRibbonCache } from "@/components/beta-raid/roadRibbonCache";
import { fieldConfigDraft, type FieldConfig } from "@/lib/fieldConfig";

/** Кисть местности сейчас — команда куполу, а не тип земли. */
const isVoidBrush = (id: string) => id === VOID_ON || id === VOID_OFF;
/**
 * Кисть биом-выделения. В клетку ничего не пишется: сентинел — только
 * маркер, чтобы обработчик тапа знал, куда положить/из чего убрать ключ
 * в selectedForGen, вместо обычной покраски местности.
 */
const isGenBrush = (id: string) => id === GEN_ON || id === GEN_OFF;

/**
 * Черновик со стопкой дорог → одна дорога на клетку.
 *
 * Кисть когда-то ДОПИСЫВАЛА дорогу к клетке, и в старых черновиках (локальная
 * библиотека, выгруженный JSON) лежит поле roadIds. Берём ПОСЛЕДНЮЮ — это
 * последний мазок админа, ровно её редактор и рисовал сверху; так же выбирает
 * сервер (map-roads.cellRoadId).
 *
 * Зовётся во ВСЕХ входах карты, а не только при монтировании: карта из
 * библиотеки или импорт мимо этой миграции приходили без roadId вовсе, проход
 * дорог их пропускал, а «Сохранить на сервер» записывал road_id = NULL по всей
 * карте — то есть тихо стирал дорожную сеть.
 */
function migrateRoadStacks(base: Record<string, Cell>): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  for (const [k, v] of Object.entries(base)) {
    const stack = (v as Cell & { roadIds?: string[] }).roadIds;
    out[k] = { ...v, roadId: v.roadId ?? stack?.[stack.length - 1] ?? null };
  }
  return out;
}

export const Route = createFileRoute("/admin/hex-editor")({
  head: () => ({ meta: [{ title: "Редактор гекс-карт" }, { name: "robots", content: "noindex" }] }),
  component: HexEditorPage,
});

// ─── Основная страница ───
/** Что стирает ластик: всю ячейку или отдельный слой. */
type EraseLayer = "all" | "terrain" | "road" | "object" | "decoration" | "building";
const ERASE_LAYERS: Array<{ id: EraseLayer; label: string }> = [
  { id: "all", label: "Всё" },
  { id: "terrain", label: "Местность" },
  { id: "road", label: "Дороги" },
  { id: "object", label: "Объекты" },
  { id: "decoration", label: "Декор" },
  { id: "building", label: "Постройки" },
];

function HexEditorPage() {
  const [size, setSize] = useState<128 | 256 | 512>(128);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [mode, setMode] = useState<Mode>("terrain");
  const [brushTerrain, setBrushTerrain] = useState("");
  const [brushRoad, setBrushRoad] = useState("");
  const [brushObject, setBrushObject] = useState("");
  const [objectSub, setObjectSub] = useState<ObjectSub>("chest");
  // Декор (деревья/кустики) — чисто визуально, отдельно от объектов.
  const [brushDecoration, setBrushDecoration] = useState(""); // "" = «без декора» (ластик декора)
  // Ластик по слоям: что именно стирать (кистью любого размера).
  const [eraseLayer, setEraseLayer] = useState<EraseLayer>("all");
  // Типы местности с сервера.
  const terrainQ = useQuery({
    queryKey: ["hex-editor-items", "terrain"],
    queryFn: () => adminListItems({ data: { kind: "terrain" } }),
  });
  const terrains: TerrainDef[] = useMemo(() => {
    return (terrainQ.data ?? [])
      .filter((i) => i.active)
      .map((i) => ({
        id: i.id,
        label: i.name,
        file: i.imageUrl ?? "",
        cost: i.statAmount ?? 1,
        meta: (i.meta as Record<string, unknown> | null) ?? undefined,
      }));
  }, [terrainQ.data]);
  // Автоматически выбрать первый тип местности.
  useEffect(() => {
    if (terrains.length > 0 && !brushTerrain) {
      setBrushTerrain(terrains[0].id);
    }
  }, [terrains, brushTerrain]);
  const [terrainEditorOpen, setTerrainEditorOpen] = useState(false);
  const [editingTerrain, setEditingTerrain] = useState<TerrainDef | null>(null);
  const [roadEditorOpen, setRoadEditorOpen] = useState(false);
  const [editingRoad, setEditingRoad] = useState<TerrainDef | null>(null);
  const [decorEditorOpen, setDecorEditorOpen] = useState(false);
  const [editingDecor, setEditingDecor] = useState<TerrainDef | null>(null);
  // Фильтры для объектов.
  const [filterSlot, setFilterSlot] = useState<string | null>(null); // артефакты: слот
  const [filterLand, setFilterLand] = useState<string | null>(null); // мобы/боссы: локация

  // Живые ассеты из БД (доступны в режиме "Объекты").
  const artQ = useQuery({
    queryKey: ["hex-editor-items", "artifact"],
    queryFn: () => adminListItems({ data: { kind: "artifact" } }),
  });
  const bossQ = useQuery({
    queryKey: ["hex-editor-boss-templates"],
    queryFn: () => adminListBossTemplates(),
  });
  const chestQ = useQuery({
    queryKey: ["hex-editor-items", "chest"],
    queryFn: () => adminListItems({ data: { kind: "chest" } }),
  });
  const mineQ = useQuery({
    queryKey: ["hex-editor-items", "mine"],
    queryFn: () => adminListItems({ data: { kind: "mine" } }),
  });
  const roadQ = useQuery({
    queryKey: ["hex-editor-items", "road"],
    queryFn: () => adminListItems({ data: { kind: "road" } }),
  });
  // Типы дорог с сервера.
  const roads: TerrainDef[] = useMemo(() => {
    return (roadQ.data ?? [])
      .filter((i) => i.active)
      .map((i) => ({
        id: i.id,
        label: i.name,
        file: i.imageUrl ?? "",
        cost: i.statAmount ?? 1,
      }));
  }, [roadQ.data]);
  // Автоматически выбрать первый тип дороги — раньше в кисти висел
  // несуществующий id «road» и первый мазок писал мусорную дорогу.
  useEffect(() => {
    if (roads.length > 0 && !brushRoad) setBrushRoad(roads[0].id);
  }, [roads, brushRoad]);
  // Типы декораций с сервера — без цены хода, чисто визуал.
  const decorQ = useQuery({
    queryKey: ["hex-editor-items", "decoration"],
    queryFn: () => adminListItems({ data: { kind: "decoration" } }),
  });
  // Постройки: объект с цепочкой тиров, которые игрок открывает за ресурс.
  const buildingQ = useQuery({
    queryKey: ["hex-editor-items", "building"],
    queryFn: () => adminListItems({ data: { kind: "building" } }),
  });
  const buildings = useMemo(() => (buildingQ.data ?? []).filter((i) => i.active), [buildingQ.data]);
  const [brushBuilding, setBrushBuilding] = useState("");
  // Символы токенов — для цен дерева уровней на клетке.
  const tokensQ = useQuery({ queryKey: ["reward-tokens"], queryFn: () => listRewardTokens() });
  const tokenSymbols = useMemo(
    () => (tokensQ.data ?? []).map((t: { symbol: string }) => t.symbol),
    [tokensQ.data],
  );
  // По умолчанию кисть построек была пустой, то есть ластиком: админ выбирал
  // режим, тапал по клетке — и «ничего не ставилось». Берём первую постройку.
  useEffect(() => {
    if (buildings.length > 0 && !brushBuilding) setBrushBuilding(buildings[0].id);
  }, [buildings, brushBuilding]);
  const [buildingEditorOpen, setBuildingEditorOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<(typeof buildings)[number] | null>(null);
  /** Клетка с постройкой, открытая в режиме правки: тиры или снять. */
  const [buildingCell, setBuildingCell] = useState<{
    key: string;
    q: number;
    r: number;
    id: string;
  } | null>(null);
  const decorations: TerrainDef[] = useMemo(() => {
    return (decorQ.data ?? [])
      .filter((i) => i.active)
      .map((i) => ({
        id: i.id,
        label: i.name,
        file: i.imageUrl ?? "",
        cost: 0,
      }));
  }, [decorQ.data]);
  // ВСЕ ассеты (без фильтра) — для Canvas рендера (картинки).
  // Сундук/шахта: картинка для карты хранится в meta.mapImageUrl, иначе основная.
  const mapImageOf = (i: { imageUrl: string | null; meta?: unknown }) => {
    const m = i.meta as { mapImageUrl?: string | null } | null;
    return m?.mapImageUrl || i.imageUrl;
  };
  const allAssetsBySub = useMemo(() => {
    return {
      artifact: (artQ.data ?? [])
        .filter((i) => i.active)
        .map((i) => ({ id: i.id, name: i.name, imageUrl: i.imageUrl })),
      // На карте показываем mapImageUrl (если задан отдельно), иначе основную.
      boss: (bossQ.data?.templates ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        imageUrl: (b as { mapImageUrl?: string | null }).mapImageUrl || b.imageUrl,
      })),
      chest: (chestQ.data ?? [])
        .filter((i) => i.active)
        .map((i) => ({ id: i.id, name: i.name, imageUrl: mapImageOf(i) })),
      mine: (mineQ.data ?? [])
        .filter((i) => i.active)
        .map((i) => ({ id: i.id, name: i.name, imageUrl: mapImageOf(i) })),
    } as Record<ObjectSub, Array<{ id: string; name: string; imageUrl: string | null }>>;
  }, [artQ.data, bossQ.data, chestQ.data, mineQ.data]);
  // Отфильтрованные ассеты — только для палитры (UI).
  const assetsBySub = useMemo(() => {
    return {
      ...allAssetsBySub,
      artifact: allAssetsBySub.artifact.filter((i) => {
        const item = artQ.data?.find((a) => a.id === i.id);
        if (filterSlot && item?.slot !== filterSlot) return false;
        // Без локации — показываем всегда: такой объект подходит к любой.
        if (filterLand && item?.land && item.land !== filterLand) return false;
        return true;
      }),
      boss: allAssetsBySub.boss.filter((b) => {
        if (!filterLand) return true;
        const tpl = bossQ.data?.templates?.find((t) => t.id === b.id);
        return !tpl?.land || tpl.land === filterLand;
      }),
      chest: allAssetsBySub.chest.filter((i) => {
        const item = chestQ.data?.find((a) => a.id === i.id);
        if (filterLand && item?.land && item.land !== filterLand) return false;
        return true;
      }),
      mine: allAssetsBySub.mine.filter((i) => {
        const item = mineQ.data?.find((a) => a.id === i.id);
        if (filterLand && item?.land && item.land !== filterLand) return false;
        return true;
      }),
    };
  }, [allAssetsBySub, filterSlot, filterLand, artQ.data, bossQ.data, chestQ.data, mineQ.data]);
  // Уникальные значения для фильтров.
  const slotOptions = useMemo(() => {
    const slots = new Set<string>();
    for (const i of artQ.data ?? []) if (i.slot) slots.add(i.slot);
    return [...slots].sort();
  }, [artQ.data]);
  // Локация объекта = тип местности (в поле land лежит terrain_id). Раньше
  // список собирался из артефактов и показывал легаси-строки вроде «Mystical»,
  // из-за чего фильтр по боссам не совпадал ни с чем.
  const landOptions = useMemo(
    () => terrains.map((t) => ({ id: t.id, label: t.label })),
    [terrains],
  );
  // Быстрый lookup картинки по objectId для render.
  // Глобальный кеш изображений (ref — переживает ре-рендеры).
  const imgCacheRef = useRef(new Map<string, HTMLImageElement>());
  const drawPendingRef = useRef(false);
  const scheduleRedraw = useCallback(() => {
    if (drawPendingRef.current) return;
    drawPendingRef.current = true;
    requestAnimationFrame(() => {
      drawPendingRef.current = false;
      drawRef.current?.();
    });
  }, []);
  const assetImgById = useMemo(() => {
    const cache = imgCacheRef.current;
    const needed = new Set<string>();
    const collect = (sub: ObjectSub, prefix: string) => {
      for (const a of allAssetsBySub[sub] ?? []) {
        if (!a.imageUrl) continue;
        const objId = prefix + a.id;
        // В ключе и URL: иначе после перезаливки картинки кэш отдавал старую.
        const key = `${objId}|${a.imageUrl}`;
        needed.add(key);
        if (cache.has(key)) continue;
        const img = new Image();
        // cut=black: часть ассетов залита в JPEG (без прозрачности) и на
        // карте давала чёрный круг. Вырезаем фон от краёв, детали целы.
        img.src = thumb(a.imageUrl, 160, "black");
        img.onload = scheduleRedraw;
        cache.set(key, img);
      }
    };
    collect("artifact", "artifact:");
    collect("boss", "boss:");
    // Сундуки и шахты тоже со своими картинками — раньше их не грузили,
    // и на карте вместо ассета показывался эмодзи-заглушка.
    collect("chest", "chest:");
    collect("mine", "mine:");
    // hero УДАЛЁН — не размещаем на карте
    // Чистим кеш от удалённых ассетов.
    for (const k of cache.keys()) {
      if (!needed.has(k)) cache.delete(k);
    }
    return cache;
  }, [allAssetsBySub, scheduleRedraw]);
  const [tapA, setTapA] = useState<Axial | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [brushSize, setBrushSize] = useState(1); // 1-10, работает для местности и ластика
  const [undoStack, setUndoStack] = useState<UndoOp[]>([]);
  // Выделение под биом-генератор: набор ключей клеток. В БД и в клетку
  // НЕ пишется — это временный маркер редактора. Тонкая жёлтая пунктирная
  // обводка рисуется поверх карты (см. draw ниже, отдельный проход).
  const [selectedForGen, setSelectedForGen] = useState<Set<string>>(() => new Set());
  // Preview-буфер биом-генератора: что покрасил бы «Применить». Держим
  // параллельно основной модели клеток — тогда preview можно перекатать
  // (перегенерировать) без записи в cells и без записи в undoStack.
  const [genPreviewPatches, setGenPreviewPatches] = useState<Map<string, BiomePatch>>(
    () => new Map(),
  );
  const [panelOpen, setPanelOpen] = useState(true);
  // Режим редактирования: тап по объекту → попап с настройками.
  const [editMode, setEditMode] = useState(false);
  const [editTarget, setEditTarget] = useState<{ key: string; cell: Cell } | null>(null);
  // Босс живёт не в общем справочнике, а в своей таблице, и удаляется своим
  // окном: там видно, сколько его копий стоит на картах, и есть галочка
  // «убрать их заодно». Крестик палитры раньше звал adminDeleteItem — тот
  // искал шаблон среди предметов и честно отвечал «не найден».
  const [delBossTpl, setDelBossTpl] = useState<{ id: string; name: string } | null>(null);
  // Выбор типа объекта при клике в режиме правки.
  const [objectTypeSelector, setObjectTypeSelector] = useState<{ key: string; cell: Cell } | null>(
    null,
  );
  // Inline-создание ассета (попап поверх карты).
  const [inlineCreate, setInlineCreate] = useState<ObjectSub | null>(null);
  // Библиотека карт + имя текущей.
  const [library, setLibrary] = useState<SavedMap[]>([]);
  const [currentMapId, setCurrentMapId] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState<string>(() => {
    // Имя открытой серверной карты переживает перезагрузку вместе с её id.
    try {
      return localStorage.getItem("hex-editor:serverMapName") || "Черновик";
    } catch {
      return "Черновик";
    }
  });
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Серверные карты.
  const qc = useQueryClient();
  const serverMapsQ = useQuery({ queryKey: ["hex-maps"], queryFn: () => adminListHexMaps() });
  const [serverMapId, setServerMapId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("hex-editor:serverMapId");
    } catch {
      return null;
    }
  });
  // Сохраняем serverMapId в localStorage при изменении.
  useEffect(() => {
    try {
      if (serverMapId) localStorage.setItem("hex-editor:serverMapId", serverMapId);
      else localStorage.removeItem("hex-editor:serverMapId");
    } catch {
      /* ignore */
    }
  }, [serverMapId]);
  // Имя серверной карты храним рядом с её id: без него после перезагрузки
  // редактор считал открытую карту «Черновиком» и просил придумать название.
  useEffect(() => {
    try {
      if (serverMapId && currentName) localStorage.setItem("hex-editor:serverMapName", currentName);
      if (!serverMapId) localStorage.removeItem("hex-editor:serverMapName");
    } catch {
      /* ignore */
    }
  }, [serverMapId, currentName]);
  /**
   * Версия карты на момент загрузки. Пока редактор держит черновик, админ
   * правит ту же карту прямо в игре — сохранение целиком снесло бы те правки.
   * Сервер сверит версию и откажет, а не потеряет их молча.
   */
  const [serverRevision, setServerRevision] = useState<number | null>(null);
  const [serverLibraryOpen, setServerLibraryOpen] = useState(false);
  const [betaRaidSelectorOpen, setBetaRaidSelectorOpen] = useState(false);

  const saveToServer = useMutation({
    /** asCopy — сознательно создать НОВУЮ карту вместо правки открытой. */
    mutationFn: (opts?: { asCopy?: boolean }) => {
      // Карта открыта с сервера — просто перезаписываем её: имя уже есть,
      // спрашивать его заново значило плодить дубли боевых карт.
      const updating = !!serverMapId && !opts?.asCopy;
      // Перезапись живой карты — действие без отката: спрашиваем прямо.
      if (updating) {
        const filled = Object.values(cells).filter((c) => c.terrainId).length;
        if (!confirm(`Перезаписать карту «${currentName}» на сервере? Клеток: ${filled}`)) {
          return Promise.reject(new Error("Отменено"));
        }
      }
      let name: string | undefined = currentName;
      if (!updating) {
        const askName = prompt(
          opts?.asCopy ? "Название копии:" : "Название карты для сервера:",
          opts?.asCopy ? `${currentName} (копия)` : currentName || "Новая карта",
        );
        if (!askName?.trim()) return Promise.reject(new Error("Отменено"));
        name = askName.trim();
        setCurrentName(name);
      } else {
        name = undefined; // имя карты на сервере не трогаем
      }
      return adminSaveHexMap({
        data: {
          mapId: updating ? (serverMapId ?? undefined) : undefined,
          name,
          size,
          ...(updating && serverRevision !== null ? { revision: serverRevision } : {}),
          cells: Object.fromEntries(
            Object.entries(cells).map(([k, v]) => [
              k,
              {
                terrainId: v.terrainId,
                roadId: v.roadId ?? null,
                objectId: v.objectId ?? null,
                // Настройки конкретной клетки не теряем при сохранении карты.
                objectConfig: v.objectConfig ?? null,
                decorationId: v.decorationId ?? null,
                buildingId: v.buildingId ?? null,
                buildingConfig: v.buildingConfig ?? null,
                voidFog: !!v.voidFog,
              },
            ]),
          ),
        },
      });
    },
    onSuccess: (result) => {
      setServerMapId(result.mapId);
      // Своё же сохранение сдвинуло версию — считаем её заново с сервера.
      setServerRevision(null);
      toast.success(`Сохранено на сервер: ${result.cellCount} ячеек`);
      qc.invalidateQueries({ queryKey: ["hex-maps"] });
      // Освобождаем localStorage — карта теперь на сервере.
      try {
        localStorage.removeItem(LS_KEY);
        if (currentMapId) {
          const lib = loadLibrary().filter((m) => m.id !== currentMapId);
          persistLibrary(lib);
          setLibrary(lib);
        }
      } catch {
        /* ignore */
      }
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const loadFromServer = async (mapId: string) => {
    try {
      const result = await adminLoadHexMap({ data: { mapId } });
      setServerRevision(result.revision ?? 0);
      const cellsRecord: Record<string, Cell> = {};
      for (const [k, v] of Object.entries(result.cells)) {
        cellsRecord[k] = {
          terrainId: v.terrainId,
          // Сервер уже отдал ОДНУ дорогу (map-roads.cellRoadId) — разбирать нечего.
          roadId: v.roadId ?? null,
          objectId: v.objectId ?? undefined,
          decorationId: v.decorationId ?? undefined,
          buildingId: (v as { buildingId?: string | null }).buildingId ?? undefined,
          buildingConfig: (v as { buildingConfig?: unknown }).buildingConfig ?? undefined,
          objectConfig: (v as { objectConfig?: unknown }).objectConfig ?? undefined,
          voidFog: (v as { voidFog?: boolean }).voidFog === true,
        };
      }
      setSize(result.map.size as 128 | 256 | 512);
      setCells(cellsRecord);
      setUndoStack([]);
      setTapA(null);
      setPan({ x: 0, y: 0 });
      setCurrentMapId(null);
      setCurrentName(result.map.name);
      setServerMapId(result.map.id);
      setServerLibraryOpen(false);
      toast.success(`Загружено с сервера: «${result.map.name}»`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки");
    }
  };

  const deleteFromServer = useMutation({
    mutationFn: (mapId: string) => adminDeleteHexMap({ data: { mapId } }),
    onSuccess: () => {
      toast.success("Удалено с сервера");
      qc.invalidateQueries({ queryKey: ["hex-maps"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tilesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const decorTilesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const roadTilesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  // Спрайты дорожных лент — те же, что печёт игра. Живут в ref, а не в стейте:
  // зум и панорама их не пересобирают, поэтому и перерисовки React не нужно.
  const roadRibbonsRef = useRef<RoadRibbonCache>(new RoadRibbonCache());
  const buildingTilesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const drawRef = useRef<(() => void) | null>(null);
  const handleCellTapRef = useRef<((cell: Axial) => void) | null>(null);
  // Refs для актуальных значений в native touch handler'ах (React state не
  // видно в замыкании addEventListener'а).
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const sizeRef = useRef<128 | 256 | 512>(128);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);
  const cellsRef = useRef(cells);
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);
  const modeRef = useRef<Mode>("terrain");
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const brushRef = useRef({ terrain: "grass", road: "road", object: "monster", decoration: "" });
  useEffect(() => {
    brushRef.current = {
      terrain: brushTerrain,
      road: brushRoad,
      object: brushObject,
      decoration: brushDecoration,
    };
  }, [brushTerrain, brushRoad, brushObject, brushDecoration]);
  const tapARef = useRef<Axial | null>(null);
  useEffect(() => {
    tapARef.current = tapA;
  }, [tapA]);

  // (замок гарантируется в useEffect восстановления ниже)

  // Загрузка тайлов один раз. Все картинки карты — уменьшенными копиями тех же
  // размеров, что у карты игры (useImageCache): оригиналы весили 121 МБ на
  // открытие редактора (06.10), а копии уже лежат готовыми на сервере.
  useEffect(() => {
    for (const t of terrains) {
      if (!t.file || tilesRef.current.has(t.id)) continue;
      const img = new Image();
      img.src = thumb(t.file, 128);
      img.onload = scheduleRedraw;
      tilesRef.current.set(t.id, img);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrains]);

  // Загрузка картинок декораций.
  useEffect(() => {
    for (const d of decorations) {
      if (!d.file || decorTilesRef.current.has(d.id)) continue;
      const img = new Image();
      img.src = thumb(d.file, 160);
      img.onload = scheduleRedraw;
      decorTilesRef.current.set(d.id, img);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decorations]);

  // Загрузка картинок построек: на карте редактора показываем облик ПЕРВОГО
  // тира — именно он встаёт на клетку, пока никто не улучшал.
  useEffect(() => {
    for (const b of buildings) {
      if (buildingTilesRef.current.has(b.id)) continue;
      const tiers = ((b.meta as { tiers?: Array<{ imageUrl?: string | null }> } | null)?.tiers ??
        []) as Array<{ imageUrl?: string | null }>;
      const src = tiers[0]?.imageUrl || b.imageUrl || "";
      if (!src) continue;
      const img = new Image();
      img.src = thumb(src, 160, "black");
      img.onload = scheduleRedraw;
      buildingTilesRef.current.set(b.id, img);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings]);

  // Загрузка картинок дорог — из них печётся лента поверх местности.
  useEffect(() => {
    // Список дорог сменился (админ завёл новую или переложил картинку) —
    // прежние спрайты испечены из прежних PNG и годятся только вводить в
    // заблуждение. Печь заново — единицы штук на карту.
    roadRibbonsRef.current.clear();
    for (const r of roads) {
      // Сверяем ИМЕННО тот адрес, который просили (img.src отдаёт его уже
      // абсолютным): иначе переложенная админом картинка дороги на превью
      // оставалась бы прежней до перезагрузки страницы.
      // Картинку сняли — забываем её здесь же: иначе лента до перезагрузки
      // страницы показывала бы удалённый рисунок (спрайт печётся из живого
      // Image, и чистка кэша спрайтов от этого не спасает).
      if (!r.file) {
        roadTilesRef.current.delete(r.id);
        continue;
      }
      if (roadTilesRef.current.get(r.id)?.dataset.src === r.file) continue;
      const img = new Image();
      img.dataset.src = r.file;
      img.src = thumb(r.file, 256);
      img.onload = scheduleRedraw;
      roadTilesRef.current.set(r.id, img);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roads]);

  // Восстановление при открытии. Редактор и режим бога правят ОДНУ таблицу
  // (raid_map_cells), поэтому по умолчанию тянем ЖИВУЮ активную карту с сервера:
  // админ ждёт увидеть здесь постройки, которые ставил прямо в игре, а не свой
  // прошлый локальный черновик («0 построек после перезагрузки»). Локальный
  // черновик оставляем только для НОВОЙ, ещё не сохранённой карты (нет привязки
  // к серверу) — иначе незавершённую заготовку смыло бы живой картой.
  const bootedRef = useRef(false);
  useEffect(() => {
    const lib = loadLibrary();
    setLibrary(lib);
    if (bootedRef.current) return; // подтяжку с сервера делаем ОДИН раз за монтирование
    bootedRef.current = true;

    const withCastle = (sz: 128 | 256 | 512, base: Record<string, Cell>) => {
      const ck = centerKey(sz);
      const migrated = migrateRoadStacks(base);
      return migrated[ck]
        ? migrated
        : { ...migrated, [ck]: { terrainId: terrains.length > 0 ? terrains[0].id : null } };
    };
    const restoreLocal = () => {
      const curId = localStorage.getItem(CUR_KEY);
      const cur = curId ? lib.find((m) => m.id === curId) : null;
      if (cur) {
        setCurrentMapId(cur.id);
        setCurrentName(cur.name);
        setSize(cur.size);
        setCells(withCastle(cur.size, cur.cells));
        return;
      }
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as MapState;
          if (saved && saved.size && saved.cells) {
            setSize(saved.size);
            setCells(withCastle(saved.size, saved.cells));
            return;
          }
        }
      } catch {
        /* ignore */
      }
      // Совсем пусто → сразу свежая карта с замком.
      const defaultTerrain = terrains.length > 0 ? terrains[0].id : null;
      setCells({ [centerKey(128)]: { terrainId: defaultTerrain } });
    };

    // Всегда открываем ЖИВУЮ активную карту: редактор и режим бога правят одну
    // таблицу raid_map_cells, и админ ждёт увидеть здесь то, что построил прямо
    // в игре. Локальный черновик — запасной вариант, если активной карты нет
    // или сеть упала. Отдельную заготовку держат в серверной библиотеке (кнопка
    // «Сервер» / «Сохранить»), а не в браузерном черновике.
    (async () => {
      try {
        const mapId = await bootMapId(() => adminActiveHexMapId());
        if (mapId) {
          await loadFromServer(mapId);
          return;
        }
      } catch {
        /* нет активной карты или сеть — падаем на локальный черновик */
      }
      restoreLocal();
    })();
  }, [terrains]);

  const R = 24; // базовый радиус гекса

  // Автосохранение в localStorage при каждом изменении клеток.
  // Обновляет и LS_KEY (черновик), и запись в библиотеке (если карта из библиотеки).
  useEffect(() => {
    if (Object.keys(cells).length === 0) return; // не сохраняем пустое состояние
    try {
      // Всегда пишем черновик.
      localStorage.setItem(LS_KEY, JSON.stringify({ size, cells } as MapState));
      // Если карта из библиотеки — обновляем и её.
      if (currentMapId) {
        const lib = loadLibrary();
        const idx = lib.findIndex((m) => m.id === currentMapId);
        if (idx >= 0) {
          lib[idx] = { ...lib[idx], size, cells, updatedAt: new Date().toISOString() };
          persistLibrary(lib);
        }
      }
    } catch {
      /* quota exceeded — ignore */
    }
  }, [cells, size, currentMapId]);

  // Пути теперь хранятся в БД (привязаны к карте), localStorage не используем.

  // A* с cost-функцией: пустая ячейка = 1, занятая = 5 (обходить если можно).
  // Для дорог: cost=1 везде (дороги идут ПРЯМО через существующие клетки).
  const findPath = useCallback(
    (a: Axial, b: Axial, roadMode = false): Axial[] | null => {
      if (!inBoundsAxial(a, size) || !inBoundsAxial(b, size)) return null;
      const start = key(a.q, a.r),
        goal = key(b.q, b.r);
      const cameFrom = new Map<string, string | null>();
      const gScore = new Map<string, number>([[start, 0]]);
      const open: Array<{ k: string; f: number }> = [{ k: start, f: hexDist(a, b) }];
      cameFrom.set(start, null);
      let steps = 0;
      while (open.length && steps++ < 20000) {
        open.sort((x, y) => x.f - y.f);
        const cur = open.shift()!;
        if (cur.k === goal) break;
        const { q, r } = parseKey(cur.k);
        for (const d of DIRS) {
          const nq = q + d.q,
            nr = r + d.r;
          const na = { q: nq, r: nr };
          if (!inBoundsAxial(na, size)) continue;
          const nk = key(nq, nr);
          // Для дорог: cost=1 везде (не обходим занятые клетки).
          // Для местности: занятые клетки = штраф 6.
          const step = roadMode ? 1 : !!cells[nk] && nk !== goal && nk !== start ? 6 : 1;
          const tentative = (gScore.get(cur.k) ?? 0) + step;
          if (tentative < (gScore.get(nk) ?? Infinity)) {
            cameFrom.set(nk, cur.k);
            gScore.set(nk, tentative);
            open.push({ k: nk, f: tentative + hexDist(na, b) });
          }
        }
      }
      if (!cameFrom.has(goal)) return null;
      const path: Axial[] = [];
      let cur: string | null = goal;
      while (cur) {
        path.push(parseKey(cur));
        cur = cameFrom.get(cur) ?? null;
      }
      return path.reverse();
    },
    [size, cells],
  );

  const applyPatches = (patches: UndoOp["patches"]) => {
    setCells((prev) => {
      const next = { ...prev };
      for (const p of patches) {
        if (p.next === null) delete next[p.k];
        else next[p.k] = p.next;
      }
      return next;
    });
    setUndoStack((s) => [...s.slice(-49), { patches }]);
  };

  // Получить все гексы в радиусе кисти от центральной точки (гексагональная форма).
  function getHexesInBrush(center: Axial, radius: number): Axial[] {
    if (radius <= 1) return [center];
    const result: Axial[] = [center];
    for (let dq = -(radius - 1); dq <= radius - 1; dq++) {
      for (let dr = -(radius - 1); dr <= radius - 1; dr++) {
        if (dq === 0 && dr === 0) continue;
        // Гексагональное расстояние: |dq| + |dr| + |dq+dr| <= 2*(radius-1)
        const ds = -dq - dr;
        if (Math.abs(dq) + Math.abs(dr) + Math.abs(ds) <= 2 * (radius - 1)) {
          const q = center.q + dq;
          const r = center.r + dr;
          if (inBoundsAxial({ q, r }, size)) {
            result.push({ q, r });
          }
        }
      }
    }
    return result;
  }

  // ─── Тап по ячейке ───
  function handleCellTap(cell: Axial) {
    const k = key(cell.q, cell.r);
    const c0 = centerKey(size);

    // Режим редактирования: тап по объекту → попап с настройками.
    // Пустая клетка → добавить тип местности, заполненная → попап объекта.
    if (editMode) {
      const cellData = cells[k];
      if (cellData?.buildingId) {
        // Постройка живёт своим слоем: её тиры и снятие — отдельное окно.
        // Без этой ветки тап уходил в «выбери объект», и постройку было не
        // достать ничем, кроме ластика.
        setBuildingCell({ key: k, q: cell.q, r: cell.r, id: cellData.buildingId });
      } else if (cellData?.objectId) {
        // Есть объект — открываем попап редактирования объекта.
        setEditTarget({ key: k, cell: cellData });
      } else if (cellData?.terrainId) {
        // Есть местность, нет объекта — показываем выбор типа объекта.
        setObjectTypeSelector({ key: k, cell: cellData });
      } else {
        // Пустая клетка — открываем редактор местности для создания нового типа.
        setEditingTerrain(null);
        setTerrainEditorOpen(true);
      }
      return;
    }

    // Ластик: стирает выбранные слои, а не всю ячейку целиком.
    // «Всё» — старое поведение (убрать ячейку полностью).
    if (mode === "erase") {
      const hexes = getHexesInBrush(cell, brushSize);
      const patches: UndoOp["patches"] = [];
      for (const h of hexes) {
        const hk = key(h.q, h.r);
        if (hk === c0) continue; // Замок не стираем
        const prev = cells[hk];
        if (!prev) continue;
        if (eraseLayer === "all") {
          patches.push({ k: hk, prev, next: null });
          continue;
        }
        const next: Cell = { ...prev };
        if (eraseLayer === "terrain") next.terrainId = null;
        if (eraseLayer === "road") next.roadId = null;
        if (eraseLayer === "decoration") next.decorationId = null;
        if (eraseLayer === "building") next.buildingId = null;
        if (eraseLayer === "object") next.objectId = undefined;
        // Пустую ячейку убираем целиком, чтобы не копить мусор.
        const empty = !next.terrainId && !next.objectId && !next.decorationId && !next.roadId;
        patches.push({ k: hk, prev, next: empty ? null : next });
      }
      if (patches.length > 0) applyPatches(patches);
      return;
    }

    if (mode === "object") {
      // Без выбранного шаблона objectId был бы просто «chest» — сервер такой
      // объект не находит, а клетка навсегда остаётся заблокированной.
      if (!brushObject.includes(":")) {
        toast.error("Сначала выбери объект в палитре");
        return;
      }
      // Объект ставится ОДНИМ тапом в ячейку (даже пустую — авто-подложка «трава»).
      const prev = cells[k] ?? null;
      const next: Cell = prev
        ? { ...prev, objectId: brushObject }
        : {
            // Кисть может стоять на куполе — землёй он не бывает, поэтому
            // подложку берём первым типом местности.
            terrainId:
              (isVoidBrush(brushTerrain) ? "" : brushTerrain) ||
              (terrains.length > 0 ? terrains[0].id : null),
            objectId: brushObject,
          };
      applyPatches([{ k, prev, next }]);
      return;
    }

    // Декор: рисование кистью, только по клеткам с местностью (дерево не
    // ставится в пустоту). Пустая кисть ("") — стирает декор, не трогая
    // остальное содержимое клетки.
    if (mode === "decoration") {
      const hexes = getHexesInBrush(cell, brushSize);
      const patches: UndoOp["patches"] = [];
      for (const h of hexes) {
        const hk = key(h.q, h.r);
        const prev = cells[hk] ?? null;
        if (!prev?.terrainId) continue;
        const nextDecor = brushDecoration || null;
        if ((prev.decorationId ?? null) === nextDecor) continue;
        patches.push({ k: hk, prev, next: { ...prev, decorationId: nextDecor } });
      }
      if (patches.length > 0) applyPatches(patches);
      return;
    }

    // Постройки: ставим по клеткам с местностью, пустая кисть — снимает.
    if (mode === "building") {
      const hexes = getHexesInBrush(cell, brushSize);
      const patches: UndoOp["patches"] = [];
      for (const h of hexes) {
        const hk = key(h.q, h.r);
        const prev = cells[hk] ?? null;
        if (!prev?.terrainId) continue;
        const nextBuilding = brushBuilding || null;
        if ((prev.buildingId ?? null) === nextBuilding) continue;
        patches.push({ k: hk, prev, next: { ...prev, buildingId: nextBuilding } });
      }
      if (patches.length > 0) applyPatches(patches);
      return;
    }

    // Местность: рисование кистью (без A* pathfinding).
    if (mode === "terrain") {
      const hexes = getHexesInBrush(cell, brushSize);
      // Кисть биом-выделения — не покраска, а add/remove в set. Направление
      // определяет первая клетка мазка (как у купола). Ничего
      // в клетки не пишем, undoStack не трогаем.
      if (isGenBrush(brushTerrain)) {
        const first = hexes[0];
        if (!first) return;
        const firstKey = key(first.q, first.r);
        const removing = selectedForGen.has(firstKey);
        setSelectedForGen((prev) => {
          const next = new Set(prev);
          for (const h of hexes) {
            const hk = key(h.q, h.r);
            if (removing) next.delete(hk);
            else next.add(hk);
          }
          return next;
        });
        return;
      }
      const patches: UndoOp["patches"] = [];
      // Купол — не слой местности: пишем ТОЛЬКО его флаг и только по клетке с
      // землёй. Всё под ним (дорога, декор, объект, постройка) остаётся как
      // было, поэтому снятие возвращает клетку ровно в прежний вид.
      if (isVoidBrush(brushTerrain)) {
        // Направление мазка — по первой клетке: если у неё купола нет,
        // накрываем весь мазок; если есть, снимаем. Одна кнопка в палитре
        // покрывает оба сценария без «переключить».
        const firstHex = hexes[0];
        const firstCell = firstHex ? (cells[key(firstHex.q, firstHex.r)] ?? null) : null;
        const want = !firstCell?.voidFog;
        for (const h of hexes) {
          const hk = key(h.q, h.r);
          const prev = cells[hk] ?? null;
          if (!prev?.terrainId) continue;
          if (!!prev.voidFog === want) continue;
          patches.push({ k: hk, prev, next: { ...prev, voidFog: want } });
        }
        if (patches.length > 0) applyPatches(patches);
        return;
      }
      for (const h of hexes) {
        const hk = key(h.q, h.r);
        const prev = cells[hk] ?? null;
        if (!prev) {
          patches.push({ k: hk, prev: null, next: { terrainId: brushTerrain } });
        } else if (prev.terrainId !== brushTerrain) {
          patches.push({ k: hk, prev, next: { ...prev, terrainId: brushTerrain } });
        }
      }
      if (patches.length > 0) applyPatches(patches);
      return;
    }

    // Дорога: тап A → тап B (A* pathfinding).
    if (mode === "road") {
      if (!tapA) {
        setTapA(cell);
        return;
      }
      if (tapA.q === cell.q && tapA.r === cell.r) {
        setTapA(null);
        return;
      }
      const path = findPath(tapA, cell, true);
      setTapA(null);
      if (!path) {
        toast.error("Путь не найден");
        return;
      }
      const patches: UndoOp["patches"] = [];
      for (const h of path) {
        const kk = key(h.q, h.r);
        const prev = cells[kk] ?? null;
        if (!prev?.terrainId) {
          // Клетку без местности сервер не сохраняет — дорога «в пустоте»
          // молча пропадала после публикации. Пропускаем такие клетки.
          continue;
        } else if (prev.roadId !== brushRoad) {
          // Кисть ЗАМЕНЯЕТ дорогу, а не дописывает к прежней. Дописывала — и в
          // базе слежались склейки «id,id,id» до семи штук: игра брала из них
          // первую, редактор рисовал последнюю, отсюда «в админке одно, в
          // проде другое».
          patches.push({ k: kk, prev, next: { ...prev, roadId: brushRoad } });
        }
      }
      if (patches.length === 0) {
        toast.message("Ничего не изменилось");
        return;
      }
      applyPatches(patches);
      return;
    }
  }

  // ─── Рендер ───
  // Разобранный список ячеек. parseKey — это split строки + два Number; гонять
  // его по 17k+ ячеек ПЯТЬ раз за кадр (местность, дороги, оверлей, туман,
  // подсветка) и было тем самым «слайд-шоу» на перетаскивании. Парсим один раз
  // на смену cells, а кадр только считает пиксели.
  type PCell = { k: string; q: number; r: number; cell: Cell };
  const cellList = useMemo<PCell[]>(() => {
    const out: PCell[] = [];
    for (const k in cells) {
      const { q, r } = parseKey(k);
      out.push({ k, q, r, cell: cells[k] });
    }
    return out;
  }, [cells]);
  // Оверлей (декор/объект/постройка/замок), отсортированный сверху вниз. Порядок
  // по экранному y от масштаба не зависит (axialToPixel линейна по радиусу) —
  // сортируем на смену карты, а не каждый кадр при зуме/пане.
  const overlayList = useMemo<PCell[]>(() => {
    const ck = centerKey(size);
    const out = cellList.filter(
      (pc) => pc.cell.decorationId || pc.cell.objectId || pc.cell.buildingId || pc.k === ck,
    );
    out.sort((a, b) => axialToPixel(a.q, a.r, R).y - axialToPixel(b.q, b.r, R).y);
    return out;
  }, [cellList, size]);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = wrap.clientWidth,
      H = wrap.clientHeight;
    if (cv.width !== W * dpr || cv.height !== H * dpr) {
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.style.width = W + "px";
      cv.style.height = H + "px";
    }
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#0a0d13";
    g.fillRect(0, 0, W, H);

    const rPix = R * scale;
    const cx = W / 2 + pan.x,
      cy = H / 2 + pan.y;

    // Границы карты (для рамки-«лесс»)
    const c0 = CENTER(size);
    const c0p = axialToPixel(c0.q, c0.r, rPix);
    // Центрируем на замке: viewport 0,0 = замок при pan=(0,0)
    const ox = cx - c0p.x,
      oy = cy - c0p.y;

    // 1) Фон-гексы в квадратной области (только видимые col/row).
    // Оценим видимый диапазон offset-координат.
    // col ≈ (x - ox) / (rPix*SQRT3) - r/2, row ≈ (y - oy) / (rPix*1.5)
    const rowMin = Math.max(0, Math.floor((-oy - rPix * 2) / (rPix * 1.5)));
    const rowMax = Math.min(size - 1, Math.ceil((H - oy + rPix * 2) / (rPix * 1.5)));
    for (let row = rowMin; row <= rowMax; row++) {
      // сдвиг odd-r
      const colMin = Math.max(0, Math.floor((-ox - rPix * 2) / (rPix * SQRT3) - 0.5));
      const colMax = Math.min(size - 1, Math.ceil((W - ox + rPix * 2) / (rPix * SQRT3) + 0.5));
      for (let col = colMin; col <= colMax; col++) {
        const a = offsetToAxial(col, row);
        const p = axialToPixel(a.q, a.r, rPix);
        const x = ox + p.x,
          y = oy + p.y;
        if (x < -rPix * 2 || x > W + rPix * 2) continue;
        drawHex(g, x, y, rPix, "#131822", "#1e2632");
      }
    }

    // 2a) Заполненные ячейки — ТОЛЬКО местность (terrain).
    for (const { q, r, cell } of cellList) {
      const p = axialToPixel(q, r, rPix);
      const x = ox + p.x,
        y = oy + p.y;
      if (x < -rPix * 2 || x > W + rPix * 2 || y < -rPix * 2 || y > H + rPix * 2) continue;
      if (cell.terrainId) {
        const img = tilesRef.current.get(cell.terrainId);
        if (img && img.complete && img.naturalWidth > 0) {
          g.save();
          hexPath(g, x, y, rPix);
          g.clip();
          if (cell.shoulder) g.globalAlpha = 0.35;
          // Растянуть изображение на весь гекс (pointy-top: ширина = sqrt(3)*R, высота = 2*R)
          g.drawImage(img, x - (rPix * SQRT3) / 2, y - rPix, rPix * SQRT3, rPix * 2);
          g.restore();
        } else {
          drawHex(g, x, y, rPix, "#3a5238", "#5a7d55");
        }
      }
    }

    // 2b) Дорога — часть «пола»: сразу после местности. Всё, что стоит
    //     на клетке (деревья, объекты), рисуется ПОВЕРХ дороги.
    for (const { q, r, cell } of cellList) {
      const roadId = cell.roadId;
      if (!roadId) continue;
      const p = axialToPixel(q, r, rPix);
      const cxc = ox + p.x,
        cyc = oy + p.y;
      if (cxc < -rPix * 2 || cxc > W + rPix * 2 || cyc < -rPix * 2 || cyc > H + rPix * 2) continue;
      // Дорога — тонкая лента поверх местности, а не заливка гекса, и её
      // спрайт печёт тот же кэш, что и игра: картинка дороги обрезана по
      // силуэту ленты. Раньше редактор рисовал ленту сам и клал текстуру
      // паттерном — на карте виден рисунок, в редакторе мозаика из него.
      drawRoadRibbon(g, roadRibbonsRef.current, {
        roadId,
        mask: roadMaskAt(cells, q, r, roadId),
        img: roadTilesRef.current.get(roadId),
        cx: cxc,
        cy: cyc,
        rPix,
      });
    }

    // 3) Декор и объекты — ОДНИМ проходом, отсортированным сверху вниз.
    //    Кто ниже на экране, тот рисуется позже и перекрывает соседа сверху:
    //    дерево на нижней клетке закрывает дорогу и объект на верхней.
    for (const { k, q, r, cell } of overlayList) {
      const p = axialToPixel(q, r, rPix);
      const x = ox + p.x,
        y = oy + p.y;
      if (x < -rPix * 2 || x > W + rPix * 2 || y < -rPix * 2 || y > H + rPix * 2) continue;

      // Декор клетки — под объектом той же клетки.
      if (cell.decorationId) {
        const img = decorTilesRef.current.get(cell.decorationId);
        if (img && img.complete && img.naturalWidth > 0) {
          const w = rPix * 1.5;
          const h = w * (img.naturalHeight / img.naturalWidth);
          g.drawImage(img, x - w / 2, y + rPix * 0.55 - h, w, h);
        } else {
          g.fillStyle = "#7dd39b";
          g.font = `${Math.max(10, rPix * 0.7)}px system-ui`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText("🌳", x, y);
        }
      }

      // Постройка клетки — над декором, под объектом. Без этого поставленная
      // постройка не появлялась на карте, и выглядело это как «не ставится».
      if (cell.buildingId) {
        const img = buildingTilesRef.current.get(cell.buildingId);
        if (img && img.complete && img.naturalWidth > 0) {
          const w = rPix * 1.4;
          const h = w * (img.naturalHeight / img.naturalWidth);
          g.drawImage(img, x - w / 2, y + rPix * 0.5 - h, w, h);
        } else {
          g.fillStyle = "#9ad0ff";
          g.font = `${Math.max(10, rPix * 0.7)}px system-ui`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText("🏠", x, y);
        }
        drawHexOutline(g, x, y, rPix * 0.9, "#9ad0ff", 1.5);
      }

      // Junction outline
      if (cell.junction) drawHexOutline(g, x, y, rPix * 0.85, "#f6c453", 2);

      // Object: картинка ассета (если загружена), иначе эмодзи-глиф.
      if (cell.objectId) {
        const parsed = parseObjectId(cell.objectId);
        const meta = OBJECT_SUBS.find((s) => s.key === (parsed?.sub ?? "chest"));
        drawHexOutline(g, x, y, rPix * 0.95, meta?.color ?? "#fff", 2);
        const imgKey = [...assetImgById.keys()].find((kk) => kk.startsWith(cell.objectId + "|"));
        const img = imgKey ? assetImgById.get(imgKey) : undefined;
        if (img && img.complete && img.naturalWidth > 0) {
          const r2 = rPix * 0.7;
          g.save();
          g.beginPath();
          g.arc(x, y, r2, 0, Math.PI * 2);
          g.clip();
          g.drawImage(img, x - r2, y - r2, r2 * 2, r2 * 2);
          g.restore();
        } else {
          g.fillStyle = "#fff";
          g.font = `bold ${Math.max(10, rPix * 0.8)}px system-ui`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(meta?.emoji ?? "❓", x, y);
        }
      }

      // Замок
      if (k === centerKey(size)) {
        drawHexOutline(g, x, y, rPix, "#e8c766", 2.5);
        g.fillStyle = "#e8c766";
        g.font = `${Math.max(11, rPix * 0.8)}px system-ui`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("🏰", x, y);
      }
    }

    // 4a) Preview биом-генератора: полупрозрачная местность поверх текущей.
    //     Отдельный слой ПОВЕРХ базовой отрисовки, но ПОД куполом тумана —
    //     чтобы preview был читаемо виден, но не перекрывал явные пометки
    //     непроходимости. В клетки ничего не пишется до «Применить».
    if (genPreviewPatches.size > 0) {
      for (const [k, patch] of genPreviewPatches) {
        if (!patch.terrainId) continue;
        const { q, r } = parseKey(k);
        const p = axialToPixel(q, r, rPix);
        const x = ox + p.x,
          y = oy + p.y;
        if (x < -rPix * 2 || x > W + rPix * 2 || y < -rPix * 2 || y > H + rPix * 2) continue;
        const img = tilesRef.current.get(patch.terrainId);
        if (img && img.complete && img.naturalWidth > 0) {
          g.save();
          hexPath(g, x, y, rPix);
          g.clip();
          g.globalAlpha = 0.55;
          g.drawImage(img, x - (rPix * SQRT3) / 2, y - rPix, rPix * SQRT3, rPix * 2);
          g.restore();
        } else {
          // Ассет ещё не загружен — рисуем сплошной жёлтый намёк, чтобы
          // клетка не «пропала» из preview на слабой сети.
          g.save();
          hexPath(g, x, y, rPix);
          g.fillStyle = "rgba(246, 196, 83, 0.35)";
          g.fill();
          g.restore();
        }
      }
      // Preview-декор: рисуем поверх preview-местности. Настоящий декор
      // клетки (cell.decorationId) уже отрисован в overlayList — preview
      // накладывается сверху ЭТИМ проходом, потому что генератор мог его
      // заменить.
      for (const [k, patch] of genPreviewPatches) {
        if (!patch.decorationId) continue;
        const { q, r } = parseKey(k);
        const p = axialToPixel(q, r, rPix);
        const x = ox + p.x,
          y = oy + p.y;
        if (x < -rPix * 2 || x > W + rPix * 2 || y < -rPix * 2 || y > H + rPix * 2) continue;
        const img = decorTilesRef.current.get(patch.decorationId);
        if (img && img.complete && img.naturalWidth > 0) {
          const w = rPix * 1.5;
          const h = w * (img.naturalHeight / img.naturalWidth);
          g.save();
          g.globalAlpha = 0.7;
          g.drawImage(img, x - w / 2, y + rPix * 0.55 - h, w, h);
          g.restore();
        }
      }
    }

    // 4b) Выделение под биом-генератор: тонкая жёлтая ПУНКТИРНАЯ обводка
    //     поверх клеток. Отдельным цветом и стилем — чтобы не спутать с
    //     подсветкой «правка» (сплошная линия) и tapA-маркером.
    if (selectedForGen.size > 0) {
      g.save();
      g.setLineDash([5, 3]);
      g.strokeStyle = "#f6c453";
      g.lineWidth = 1.6;
      for (const kk of selectedForGen) {
        const { q, r } = parseKey(kk);
        const p = axialToPixel(q, r, rPix);
        const x = ox + p.x,
          y = oy + p.y;
        if (x < -rPix * 2 || x > W + rPix * 2 || y < -rPix * 2 || y > H + rPix * 2) continue;
        hexPath(g, x, y, rPix * 0.92);
        g.stroke();
      }
      g.setLineDash([]);
      g.restore();
    }

    // 5) Купол глухого тумана — ПОВЕРХ всего, что на клетке. Не заливка и не
    //    тип местности: под ним всё цело и видно сквозь дымку, снятие
    //    возвращает клетку в прежний вид.
    for (const { q, r, cell } of cellList) {
      if (!cell.voidFog) continue;
      const p = axialToPixel(q, r, rPix);
      const x = ox + p.x,
        y = oy + p.y;
      if (x < -rPix * 2 || x > W + rPix * 2 || y < -rPix * 2 || y > H + rPix * 2) continue;
      drawVoidDome(g, x, y, rPix);
    }

    // 6) tap-A маркер
    if (tapA) {
      const p = axialToPixel(tapA.q, tapA.r, rPix);
      drawHexOutline(g, ox + p.x, oy + p.y, rPix * 0.9, "#41d3c6", 3);
    }
    // 7) Режим редактирования — подсветка того, что открывается тапом:
    // объекты жёлтым, постройки — своим цветом, иначе их не отличить.
    if (editMode) {
      for (const { q, r, cell } of cellList) {
        if (!cell.objectId && !cell.buildingId) continue;
        const p = axialToPixel(q, r, rPix);
        const x = ox + p.x,
          y = oy + p.y;
        if (x < -rPix * 2 || x > W + rPix * 2 || y < -rPix * 2 || y > H + rPix * 2) continue;
        drawHexOutline(g, x, y, rPix * 0.95, cell.buildingId ? "#4fd6e0" : "#f6c453", 2.5);
      }
    }
  }, [
    size,
    cells,
    cellList,
    overlayList,
    scale,
    pan,
    tapA,
    assetImgById,
    editMode,
    selectedForGen,
    genPreviewPatches,
  ]);

  // Отрисовку не зовём синхронно на каждый setPan/setScale: при перетаскивании
  // событий десятки в кадр, и синхронный draw превращал пан в слайд-шоу.
  // scheduleRedraw коалесит их в один кадр rAF и рисует свежим draw (через ref).
  useEffect(() => {
    drawRef.current = draw;
    scheduleRedraw();
  }, [draw, scheduleRedraw]);
  useEffect(() => {
    const onResize = () => scheduleRedraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [scheduleRedraw]);
  // handleCellTap тоже нужно ссылать по ref — из native handler'a.
  useEffect(() => {
    handleCellTapRef.current = handleCellTap;
  });

  // ─── Native gesture layer ───
  // Причина: React onPointer* + passive listener на mobile safari/chrome НЕ
  // позволяет preventDefault, а без него браузер сам скроллит/зумит страницу
  // и наши обработчики не срабатывают. Ставим native listener'ы с
  // {passive:false} через ref.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const touches = new Map<number, { x: number; y: number }>();
    let gesture:
      | null
      | {
          kind: "pan";
          startPan: { x: number; y: number };
          startX: number;
          startY: number;
          moved: boolean;
          ts: number;
        }
      | {
          kind: "pinch";
          startDist: number;
          startScale: number;
          startPan: { x: number; y: number };
          // Якорь пинча: середина между пальцами в координатах канваса на старте.
          mx: number;
          my: number;
          W: number;
          H: number;
        } = null;

    /**
     * Событие относится к карте, только если оно пришло с самого канваса.
     * Попапы (редактор постройки, карточка клетки) и панель кисти лежат ВНУТРИ
     * этой же обёртки, поэтому их тапы всплывали сюда: карта дёргалась и по
     * отпусканию ставила постройку прямо из открытого окна.
     */
    const onCanvas = (target: EventTarget | null): boolean =>
      !!target && target === canvasRef.current;

    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const clampScale = (s: number) => Math.max(0.08, Math.min(5, s));

    const doTap = (clientX: number, clientY: number) => {
      // Под пальцем должен быть именно канвас: если сверху открыт попап или
      // панель кисти — это не тап по карте.
      const target = document.elementFromPoint(clientX, clientY);
      if (!onCanvas(target)) return;

      const rect = el.getBoundingClientRect();
      const s = scaleRef.current,
        p = panRef.current,
        sz = sizeRef.current;
      const c0 = CENTER(sz);
      const c0p = axialToPixel(c0.q, c0.r, R * s);
      const cx = rect.width / 2 + p.x,
        cy = rect.height / 2 + p.y;
      const ox = cx - c0p.x,
        oy = cy - c0p.y;
      const cell = pixelToAxial(clientX - rect.left - ox, clientY - rect.top - oy, R * s);
      if (!inBoundsAxial(cell, sz)) return;
      handleCellTapRef.current?.(cell);
    };

    // Пальцы, начавшие касание на UI поверх карты (селектор кисти): их не
    // трогаем и НЕ вызываем preventDefault — иначе браузер не сгенерит click
    // и кнопки размера кисти не нажимаются на телефоне. Помним их поимённо,
    // чтобы один «UI-палец» не выключал панораму/пинч для остальных.
    const uiTouches = new Set<number>();

    const onTouchStart = (e: TouchEvent) => {
      const fresh = Array.from(e.changedTouches);
      const onUi = fresh.filter((t) => !onCanvas(document.elementFromPoint(t.clientX, t.clientY)));
      for (const t of onUi) uiTouches.add(t.identifier);
      if (onUi.length === fresh.length) return; // все новые пальцы — на UI
      e.preventDefault();
      for (const t of fresh) {
        if (uiTouches.has(t.identifier)) continue;
        touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (touches.size === 1) {
        const t = Array.from(touches.values())[0];
        gesture = {
          kind: "pan",
          startPan: { ...panRef.current },
          startX: t.x,
          startY: t.y,
          moved: false,
          ts: Date.now(),
        };
      } else if (touches.size >= 2) {
        const [a, b] = Array.from(touches.values());
        const rect = el.getBoundingClientRect();
        gesture = {
          kind: "pinch",
          startDist: dist(a, b),
          startScale: scaleRef.current,
          startPan: { ...panRef.current },
          mx: (a.x + b.x) / 2 - rect.left,
          my: (a.y + b.y) / 2 - rect.top,
          W: el.clientWidth,
          H: el.clientHeight,
        };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      const moved = Array.from(e.changedTouches).filter((t) => touches.has(t.identifier));
      if (moved.length === 0) return; // двигаются только UI-пальцы
      e.preventDefault();
      for (const t of moved) touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      if (!gesture) return;
      if (gesture.kind === "pan" && touches.size === 1) {
        const t = Array.from(touches.values())[0];
        const dx = t.x - gesture.startX,
          dy = t.y - gesture.startY;
        if (Math.hypot(dx, dy) > 5) gesture.moved = true;
        if (gesture.moved) setPan({ x: gesture.startPan.x + dx, y: gesture.startPan.y + dy });
      } else if (gesture.kind === "pinch" && touches.size >= 2) {
        const [a, b] = Array.from(touches.values());
        const d = dist(a, b);
        if (d <= 0) return;
        const rect = el.getBoundingClientRect();
        const next = clampScale(gesture.startScale * (d / gesture.startDist));
        // Держим мировую точку, что была под серединой пинча, под ТЕКУЩЕЙ
        // серединой: жест и приближает, и тянет карту за пальцами. Формула та
        // же, что у колеса (см. onWheelNative): экран = W/2 + pan + scale*D.
        const m1x = (a.x + b.x) / 2 - rect.left;
        const m1y = (a.y + b.y) / 2 - rect.top;
        const Dx = (gesture.mx - gesture.W / 2 - gesture.startPan.x) / gesture.startScale;
        const Dy = (gesture.my - gesture.H / 2 - gesture.startPan.y) / gesture.startScale;
        setPan({ x: m1x - gesture.W / 2 - next * Dx, y: m1y - gesture.H / 2 - next * Dy });
        setScale(next);
      }
    };
    const onTouchEnd = (e: TouchEvent, cancelled = false) => {
      const ended = Array.from(e.changedTouches);
      // UI-пальцы просто забываем: карта их не обрабатывала.
      for (const t of ended) uiTouches.delete(t.identifier);
      const mapEnded = ended.filter((t) => touches.has(t.identifier));
      if (mapEnded.length === 0) return;
      e.preventDefault();
      // Прерванный системой жест (touchcancel) тапом не считаем.
      const wasTap =
        !cancelled &&
        gesture &&
        gesture.kind === "pan" &&
        !gesture.moved &&
        Date.now() - gesture.ts < 500;
      const tapT =
        wasTap && mapEnded[0] ? { x: mapEnded[0].clientX, y: mapEnded[0].clientY } : null;
      for (const t of mapEnded) touches.delete(t.identifier);
      if (touches.size < 2) gesture = null;
      if (tapT) doTap(tapT.x, tapT.y);
    };
    const onTouchCancel = (e: TouchEvent) => onTouchEnd(e, true);

    // Мышь (десктоп): drag = pan, click без движения = tap, wheel = zoom.
    let mouseDrag: {
      startPan: { x: number; y: number };
      startX: number;
      startY: number;
      moved: boolean;
      ts: number;
    } | null = null;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!onCanvas(e.target)) return;
      mouseDrag = {
        startPan: { ...panRef.current },
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        ts: Date.now(),
      };
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDrag) return;
      const dx = e.clientX - mouseDrag.startX,
        dy = e.clientY - mouseDrag.startY;
      if (Math.hypot(dx, dy) > 5) mouseDrag.moved = true;
      if (mouseDrag.moved) setPan({ x: mouseDrag.startPan.x + dx, y: mouseDrag.startPan.y + dy });
    };
    const onMouseUp = (e: MouseEvent) => {
      const st = mouseDrag;
      mouseDrag = null;
      if (!st) return;
      if (!st.moved && Date.now() - st.ts < 400) doTap(e.clientX, e.clientY);
    };
    const onWheelNative = (e: WheelEvent) => {
      if (!onCanvas(e.target)) return; // прокрутка внутри попапа — не зум карты
      e.preventDefault();
      const prev = scaleRef.current;
      const next = clampScale(prev * (e.deltaY < 0 ? 1.15 : 0.87));
      if (next === prev) return;
      // Зум к КУРСОРУ, а не к центру: точку под курсором держим на месте,
      // сдвигая pan на дельту масштаба. Экран точки = W/2 + pan + scale*D,
      // значит pan' = pan − (next/prev − 1)·(курсор − W/2 − pan).
      const rect = el.getBoundingClientRect();
      const W = el.clientWidth,
        H = el.clientHeight;
      const sx = e.clientX - rect.left,
        sy = e.clientY - rect.top;
      const f = next / prev;
      const p = panRef.current;
      setPan({ x: p.x - (f - 1) * (sx - W / 2 - p.x), y: p.y - (f - 1) * (sy - H / 2 - p.y) });
      setScale(next);
    };

    const opts = { passive: false } as AddEventListenerOptions;
    el.addEventListener("touchstart", onTouchStart, opts);
    el.addEventListener("touchmove", onTouchMove, opts);
    el.addEventListener("touchend", onTouchEnd, opts);
    el.addEventListener("touchcancel", onTouchCancel, opts);
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    el.addEventListener("wheel", onWheelNative, opts);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("wheel", onWheelNative);
    };
  }, []); // единожды при монтировании; замыкание читает через refs

  // Запуск биом-генератора: собираем клетки selectedForGen, зовём чистую
  // функцию из lib/biomeGenerators, кладём результат в preview-буфер. Каждый
  // клик даёт свой результат (внутри Math.random) — и «Сгенерировать», и
  // «Перегенерировать» ходят через этот же обработчик.
  const runBiomeGenerator = (biome: BiomeType, customTerrainId: string | null) => {
    if (selectedForGen.size === 0) return;
    const cellsForGen = Array.from(selectedForGen).map((k) => parseKey(k));
    // Генератор ждёт `{id, name}`, а справочники редактора хранят `{id, label}`
    // (это исторически визуальная подпись кнопки, а не поле БД). Переклеиваем
    // здесь, а не в чистом модуле: не тянем UI-тип в него.
    const terrainsForGen = terrains.map((t) => ({ id: t.id, name: t.label }));
    const decorationsForGen = decorations.map((d) => ({ id: d.id, name: d.label }));
    const result = generateBiome(
      biome,
      cellsForGen,
      { terrains: terrainsForGen, decorations: decorationsForGen },
      customTerrainId ? { customTerrainId } : undefined,
    );
    setGenPreviewPatches(result);
  };

  /** «Применить»: preview → applyPatches (в undoStack), очистить выделение и буфер. */
  const applyBiomeGenerator = () => {
    if (genPreviewPatches.size === 0) return;
    const patches: UndoOp["patches"] = [];
    for (const [k, patch] of genPreviewPatches) {
      const prev = cells[k] ?? null;
      // База — прежняя клетка (сохраняем road/object/decor, если генератор
      // их не трогал). Пустая клетка получит хотя бы terrainId — иначе
      // сервер её не сохранит («клетка без местности — невидимая преграда»).
      const base: Cell = prev ?? { terrainId: null };
      const next: Cell = { ...base };
      if (patch.terrainId !== undefined) next.terrainId = patch.terrainId;
      if (patch.decorationId !== undefined) next.decorationId = patch.decorationId;
      if (patch.roadId !== undefined) next.roadId = patch.roadId;
      patches.push({ k, prev, next });
    }
    if (patches.length > 0) applyPatches(patches);
    setGenPreviewPatches(new Map());
    setSelectedForGen(new Set());
    toast.success(`Биом применён: ${patches.length} клеток`);
  };

  /** «Сбросить»: preview и выделение — в мусор, ничего не пишем. */
  const resetBiomeGenerator = () => {
    setGenPreviewPatches(new Map());
    setSelectedForGen(new Set());
  };

  const doUndo = () => {
    setUndoStack((s) => {
      if (s.length === 0) {
        toast.message("Нечего отменять");
        return s;
      }
      const last = s[s.length - 1];
      setCells((prev) => {
        const next = { ...prev };
        for (const p of last.patches) {
          if (p.prev === null) delete next[p.k];
          else next[p.k] = p.prev;
        }
        return next;
      });
      return s.slice(0, -1);
    });
  };
  // Сохранить: если есть currentMapId — перезаписать в библиотеке.
  // Иначе — попросить имя, создать новую запись.
  const saveLocal = () => {
    let name = currentName;
    let id = currentMapId;
    if (!id) {
      const askName = prompt("Название карты:", currentName || "Новая карта");
      if (!askName?.trim()) return;
      name = askName.trim();
      id = `map_${nanoid(8)}`;
    }
    const rec: SavedMap = { id, name, size, cells, updatedAt: new Date().toISOString() };
    const lib = loadLibrary().filter((m) => m.id !== id);
    lib.unshift(rec);
    persistLibrary(lib);
    localStorage.setItem(CUR_KEY, id);
    setLibrary(lib);
    setCurrentMapId(id);
    setCurrentName(name);
    // Ещё пишем LS_KEY для совместимости (мгновенная защита от потери).
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ size, cells } as MapState));
    } catch {}
    toast.success(`«${name}» сохранена — ${Object.keys(cells).length} ячеек`);
  };
  // Открыть карту из библиотеки.
  const openMap = (m: SavedMap) => {
    setSize(m.size);
    setCells(migrateRoadStacks(m.cells));
    setUndoStack([]);
    setTapA(null);
    setCurrentMapId(m.id);
    setCurrentName(m.name);
    localStorage.setItem(CUR_KEY, m.id);
    setLibraryOpen(false);
    setPan({ x: 0, y: 0 });
    toast.message(`Открыто: «${m.name}»`);
  };
  // Новая пустая карта.
  const newMap = () => {
    const name = prompt("Название новой карты:", "Новая карта");
    if (!name?.trim()) return;
    setSize(128);
    setCells({ [centerKey(128)]: { terrainId: terrains.length > 0 ? terrains[0].id : null } });
    setUndoStack([]);
    setTapA(null);
    setPan({ x: 0, y: 0 });
    setScale(1);
    setCurrentMapId(null);
    setCurrentName(name.trim());
    setServerMapId(null);
    localStorage.removeItem(CUR_KEY);
    setLibraryOpen(false);
    toast.success(`Черновик «${name.trim()}» — жми «Сохранить», чтобы попасть в библиотеку`);
  };
  const deleteMap = (id: string) => {
    if (!confirm("Удалить карту?")) return;
    const lib = loadLibrary().filter((m) => m.id !== id);
    persistLibrary(lib);
    setLibrary(lib);
    if (currentMapId === id) {
      setCurrentMapId(null);
      localStorage.removeItem(CUR_KEY);
    }
    toast.success("Удалено");
  };
  const renameMap = (id: string) => {
    const cur = library.find((m) => m.id === id);
    if (!cur) return;
    const name = prompt("Новое название:", cur.name);
    if (!name?.trim()) return;
    const lib = loadLibrary().map((m) => (m.id === id ? { ...m, name: name.trim() } : m));
    persistLibrary(lib);
    setLibrary(lib);
    if (currentMapId === id) setCurrentName(name.trim());
  };
  // Автообочина: для каждой не-пустой ячейки (кроме замка/объектов/уже-обочины)
  // добавляем соседей той же terrain-подложкой с флагом shoulder (только пустые).
  const applyShoulders = () => {
    const patches: UndoOp["patches"] = [];
    for (const [k, cell] of Object.entries(cells)) {
      if (cell.shoulder) continue;
      if (!cell.terrainId) continue;
      const { q, r } = parseKey(k);
      for (const d of DIRS) {
        const nk = key(q + d.q, r + d.r);
        if (cells[nk]) continue; // не трогаем занятые
        if (!inBoundsAxial({ q: q + d.q, r: r + d.r }, size)) continue;
        patches.push({ k: nk, prev: null, next: { terrainId: cell.terrainId, shoulder: true } });
      }
    }
    if (patches.length === 0) {
      toast.message("Обочина уже есть или карта пуста");
      return;
    }
    applyPatches(patches);
    toast.success(`Обочина добавлена: +${patches.length} ячеек`);
  };
  const doExport = () => {
    const blob = new Blob([JSON.stringify({ size, cells }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hex-map-${size}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const doImport = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (!f) return;
      f.text().then((txt) => {
        try {
          const j = JSON.parse(txt) as MapState;
          if (![128, 256, 512].includes(j.size)) throw new Error("bad size");
          setSize(j.size);
          setCells(migrateRoadStacks(j.cells));
          setUndoStack([]);
          toast.success(`Загружено ${Object.keys(j.cells).length} ячеек`);
        } catch (e) {
          toast.error("Битый JSON: " + (e instanceof Error ? e.message : e));
        }
      });
    };
    inp.click();
  };
  const doResize = (newSize: 128 | 256 | 512) => {
    if (newSize === size) return;
    const trimmed: Record<string, Cell> = {};
    for (const [k, v] of Object.entries(cells)) {
      const { q, r } = parseKey(k);
      if (inBoundsAxial({ q, r }, newSize)) trimmed[k] = v;
    }
    trimmed[centerKey(newSize)] = { terrainId: terrains.length > 0 ? terrains[0].id : null };
    setSize(newSize);
    setCells(trimmed);
    setUndoStack([]);
    setPan({ x: 0, y: 0 });
    toast.message(`Размер: ${newSize}×${newSize}`);
  };
  const centerOnCastle = () => {
    setPan({ x: 0, y: 0 });
    setScale(1);
  };
  const exitFullscreen = () => {
    history.back();
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background text-foreground">
      {/* Верхний тулбар — одна лента с горизонтальным скроллом: на телефоне
          кнопки не сжимаются в кашу и не наезжают друг на друга. */}
      <div className="border-b border-border bg-card/70 backdrop-blur">
        <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={exitFullscreen}
            className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground"
            title="Выйти"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setLibraryOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded p-1.5 text-muted-foreground hover:text-foreground"
            title="Мои карты"
          >
            <Folder className="h-4 w-4" />
            <span className="hidden sm:inline">Карты</span>
          </button>
          <button
            onClick={() => setServerLibraryOpen(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded p-1.5 text-neon hover:text-neon/80"
            title="Шаблоны с сервера"
          >
            <Server className="h-4 w-4" />
            <span className="hidden sm:inline">Сервер</span>
          </button>

          <span className="mx-1 h-5 w-px shrink-0 bg-border" />

          <button
            onClick={doUndo}
            className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground"
            title="Отменить"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={centerOnCastle}
            className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground"
            title="К замку"
          >
            <Home className="h-4 w-4" />
          </button>
          <button
            onClick={() => setScale((v) => Math.max(0.08, v * 0.75))}
            className="shrink-0 rounded px-2 py-1 font-bold text-muted-foreground hover:text-foreground"
            title="Отдалить"
          >
            −
          </button>
          <button
            onClick={() => setScale((v) => Math.min(5, v * 1.33))}
            className="shrink-0 rounded px-2 py-1 font-bold text-muted-foreground hover:text-foreground"
            title="Приблизить"
          >
            +
          </button>
          <button
            onClick={applyShoulders}
            className="shrink-0 rounded p-1.5 text-muted-foreground hover:text-foreground"
            title="Обочина авто"
          >
            <Waves className="h-4 w-4" />
          </button>

          <span className="mx-1 h-5 w-px shrink-0 bg-border" />

          <div className="flex shrink-0 overflow-hidden rounded-full border border-border">
            {([128, 256, 512] as const).map((sz) => (
              <button
                key={sz}
                onClick={() => doResize(sz)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-bold",
                  size === sz ? "bg-gold/80 text-gold-foreground" : "text-muted-foreground",
                )}
              >
                {sz}
              </button>
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
            <button
              onClick={() => saveToServer.mutate(undefined)}
              disabled={saveToServer.isPending}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 disabled:opacity-50"
              title={
                serverMapId ? `Перезаписать «${currentName}» на сервере` : "Сохранить на сервер"
              }
            >
              <CloudUpload className="h-3.5 w-3.5" />
              Сохранить
            </button>
            {serverMapId && (
              <button
                onClick={() => saveToServer.mutate({ asCopy: true })}
                disabled={saveToServer.isPending}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-secondary/60 px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground disabled:opacity-50"
                title="Сохранить как новую карту"
              >
                Копия
              </button>
            )}
            <button
              onClick={() => setBetaRaidSelectorOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-bold text-rose-300"
              title="Установить как бета-рейд"
            >
              <Swords className="h-3.5 w-3.5" />В рейд
            </button>
          </div>
        </div>

        {/* Имя карты — отдельной строкой, чтобы не толкалось с кнопками. */}
        <div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-1">
          <MapPinned className="h-3.5 w-3.5 flex-none text-gold" />
          <b className="truncate text-[11px]" title={currentName}>
            {currentName}
          </b>
          {serverMapId ? (
            <span className="text-[9px] text-emerald-300">
              · карта на сервере, «Сохранить» перезапишет её
            </span>
          ) : (
            currentMapId && <span className="text-[9px] text-muted-foreground">· в библиотеке</span>
          )}
        </div>
      </div>

      {/* Режимы — лента с прокруткой, краткие подписи, фиксированная ширина. */}
      <div className="flex gap-1 overflow-x-auto border-b border-border bg-card/40 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            { k: "terrain", label: "Земля", icon: Mountain },
            { k: "road", label: "Дороги", icon: RouteIcon },
            { k: "object", label: "Объекты", icon: Sparkles },
            { k: "decoration", label: "Декор", icon: TreePine },
            { k: "building", label: "Постройки", icon: Home },
            { k: "erase", label: "Ластик", icon: Eraser },
          ] as const
        ).map((m) => {
          const Icon = m.icon;
          const on = mode === m.k && !editMode;
          return (
            <button
              key={m.k}
              onClick={() => {
                setMode(m.k);
                setPanelOpen(true);
                setTapA(null);
                setEditMode(false);
              }}
              className={cn(
                "flex w-[86px] shrink-0 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold transition",
                on
                  ? m.k === "erase"
                    ? "bg-rose-500/20 text-rose-300"
                    : "bg-emerald-500/20 text-emerald-300"
                  : "bg-secondary/30 text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" /> {m.label}
            </button>
          );
        })}
        <button
          onClick={() => {
            setEditMode(!editMode);
            setTapA(null);
          }}
          className={cn(
            "flex w-[86px] shrink-0 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold transition",
            editMode
              ? "bg-gold/20 text-gold"
              : "bg-secondary/30 text-muted-foreground hover:text-foreground",
          )}
          title="Правка: тап по объекту → настройки"
        >
          <Pencil className="h-3.5 w-3.5 shrink-0" /> Правка
        </button>
      </div>

      {/* Ластик: что именно стирать. Работает и одиночно, и кистью 1-10. */}
      {mode === "erase" && !editMode && (
        <div className="flex gap-1 overflow-x-auto border-b border-border bg-rose-500/[0.06] px-1.5 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 self-center pl-1 pr-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            стирать
          </span>
          {ERASE_LAYERS.map((l) => (
            <button
              key={l.id}
              onClick={() => setEraseLayer(l.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition",
                eraseLayer === l.id
                  ? "bg-rose-500/25 text-rose-200"
                  : "bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      {/* Inline-создание ассета (попап) */}
      {inlineCreate && (
        <FullObjectEditor
          sub={inlineCreate}
          refId={undefined}
          cellKey="new"
          onClose={() => setInlineCreate(null)}
          onUpdated={() => {
            setInlineCreate(null);
            qc.invalidateQueries({ queryKey: ["hex-editor-items"] });
            qc.invalidateQueries({ queryKey: ["hex-editor-boss-templates"] });
            toast.success("Ассет создан — выбери в палитре");
          }}
          terrains={terrains}
        />
      )}

      {/* Редактор типов местности */}
      {terrainEditorOpen && (
        <TerrainEditor
          terrain={editingTerrain}
          kind="terrain"
          onClose={() => {
            setTerrainEditorOpen(false);
            setEditingTerrain(null);
          }}
          onSaved={() => {
            setTerrainEditorOpen(false);
            setEditingTerrain(null);
          }}
        />
      )}

      {/* Редактор типов декораций */}
      {decorEditorOpen && (
        <TerrainEditor
          terrain={editingDecor}
          kind="decoration"
          onClose={() => {
            setDecorEditorOpen(false);
            setEditingDecor(null);
          }}
          onSaved={() => {
            setDecorEditorOpen(false);
            setEditingDecor(null);
          }}
        />
      )}

      {/* Редактор типов дорог */}
      {roadEditorOpen && (
        <TerrainEditor
          terrain={editingRoad}
          kind="road"
          onClose={() => {
            setRoadEditorOpen(false);
            setEditingRoad(null);
          }}
          onSaved={() => {
            setRoadEditorOpen(false);
            setEditingRoad(null);
          }}
        />
      )}

      {/* Выбор типа объекта при клике в режиме правки */}
      {objectTypeSelector && (
        <ObjectTypeSelectorPopup
          cellKey={objectTypeSelector.key}
          cell={objectTypeSelector.cell}
          onClose={() => setObjectTypeSelector(null)}
          onSelect={(sub) => {
            const objId = `${sub}:new`;
            const prev = objectTypeSelector.cell;
            const next: Cell = { ...prev, objectId: objId };
            applyPatches([{ k: objectTypeSelector.key, prev, next }]);
            setObjectTypeSelector(null);
            // Открыть попап создания для любого типа.
            setEditTarget({ key: objectTypeSelector.key, cell: next });
          }}
        />
      )}

      {delBossTpl && (
        <BossTemplateDeleteDialog
          template={delBossTpl}
          onClose={() => setDelBossTpl(null)}
          onDeleted={() => {
            qc.invalidateQueries({ queryKey: ["hex-editor-boss-templates"] });
            if (brushObject === `boss:${delBossTpl.id}`) setBrushObject("");
          }}
        />
      )}

      {/* Попап редактирования объекта на карте */}
      {editTarget && (
        <MapObjectEditor
          cellKey={editTarget.key}
          cell={editTarget.cell}
          onClose={() => setEditTarget(null)}
          onSaveToCell={(cfg) => {
            // Правка конкретного объекта на карте: в шаблон не лезем.
            setCells((prev) => ({
              ...prev,
              [editTarget.key]: {
                ...prev[editTarget.key],
                objectConfig: withKeptSnapshot(prev[editTarget.key]?.objectConfig, cfg),
              },
            }));
            setEditTarget(null);
          }}
          onUpdated={() => {
            setEditTarget(null);
            qc.invalidateQueries({ queryKey: ["hex-editor-items"] });
            qc.invalidateQueries({ queryKey: ["hex-editor-boss-templates"] });
          }}
          terrains={terrains}
        />
      )}

      {/* Палитра выбранного режима (сворачивается) */}
      {panelOpen && mode !== "erase" && (
        <div className="max-h-24 overflow-x-auto border-b border-border bg-card/30 p-1.5">
          <div className="flex gap-1">
            {mode === "terrain" && (
              <>
                {/* + Добавить — всегда первый (слева) */}
                <button
                  onClick={() => {
                    setEditingTerrain(null);
                    setTerrainEditorOpen(true);
                  }}
                  className="flex flex-none flex-col items-center gap-0.5 rounded p-0.5 transition hover:bg-secondary/40"
                  title="Добавить тип местности"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded border-2 border-dashed border-gold/50">
                    <Plus className="h-4 w-4 text-gold" />
                  </div>
                  <span className="text-[9px] text-gold">Добавить</span>
                </button>
                <VoidFogBrush value={brushTerrain} onPick={setBrushTerrain} />
                <BiomeGenBrush value={brushTerrain} onPick={setBrushTerrain} />
                {terrains.map((t) => {
                  // Кнопки правки и удаления показываем у ВЫБРАННОЙ кисти.
                  // Раньше это было отдельное «выделение» с тоглом: первый тап
                  // показывал кнопки, второй прятал, хотя кисть оставалась
                  // выбранной, — а на телефоне (где нет наведения мышью) другого
                  // способа добраться до них нет вовсе.
                  const isSelected = brushTerrain === t.id;
                  return (
                    <div
                      key={t.id}
                      className="group relative flex flex-none flex-col items-center gap-0.5 rounded p-0.5"
                    >
                      {/* Карандаш — редактирование (виден если выбран или hover) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTerrain(t);
                          setTerrainEditorOpen(true);
                        }}
                        className={cn(
                          "absolute left-0 top-0 z-10 h-4 w-4 items-center justify-center rounded bg-black/70 text-white",
                          isSelected ? "flex" : "hidden group-hover:flex",
                        )}
                        title="Редактировать"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {/* Крест — удаление (виден если выбран или hover) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Удалить «${t.label}»?`)) {
                            adminDeleteItem({ data: { id: t.id } })
                              .then(() => {
                                terrainQ.refetch();
                                toast.success("Удалено");
                              })
                              .catch((err) =>
                                toast.error(err instanceof Error ? err.message : "Ошибка"),
                              );
                          }
                        }}
                        className={cn(
                          "absolute right-0 top-0 z-10 h-4 w-4 items-center justify-center rounded bg-rose-600 text-white",
                          isSelected ? "flex" : "hidden group-hover:flex",
                        )}
                        title="Удалить"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => {
                          setBrushTerrain(t.id);
                        }}
                        className={cn(
                          "flex flex-none flex-col items-center gap-0.5 rounded transition",
                          brushTerrain === t.id
                            ? "bg-gold/10 ring-2 ring-gold"
                            : "hover:bg-secondary/40",
                        )}
                        title={`${t.label} (цена: ${t.cost})`}
                      >
                        <img
                          src={thumb(t.file, 128)}
                          alt=""
                          className="h-9 w-9 object-cover"
                          style={{
                            clipPath: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)",
                          }}
                        />
                        <span className="max-w-[52px] truncate text-[9px] text-muted-foreground">
                          {t.label}
                        </span>
                        <span className="text-[8px] text-gold/70">{t.cost}</span>
                      </button>
                    </div>
                  );
                })}
              </>
            )}
            {mode === "building" && (
              <>
                <button
                  onClick={() => {
                    setEditingBuilding(null);
                    setBuildingEditorOpen(true);
                  }}
                  className="flex flex-none flex-col items-center gap-0.5 rounded p-0.5 transition hover:bg-secondary/40"
                  title="Новая постройка"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded border-2 border-dashed border-gold/50">
                    <Plus className="h-4 w-4 text-gold" />
                  </div>
                  <span className="text-[9px] text-gold">Добавить</span>
                </button>
                <button
                  onClick={() => setBrushBuilding("")}
                  className={cn(
                    "flex flex-none flex-col items-center gap-0.5 rounded p-0.5 transition",
                    brushBuilding === "" ? "bg-gold/10 ring-2 ring-gold" : "hover:bg-secondary/40",
                  )}
                  title="Снять постройку"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded border border-border bg-secondary/30">
                    <Eraser className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-[9px] text-muted-foreground">Снять</span>
                </button>
                {buildings.map((b) => (
                  <div
                    key={b.id}
                    className="group relative flex flex-none flex-col items-center gap-0.5"
                  >
                    {/* Карандаш и крестик — как у местности: на телефоне двойного тапа мало. */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingBuilding(b);
                        setBuildingEditorOpen(true);
                      }}
                      className={cn(
                        "absolute left-0 top-0 z-10 h-4 w-4 items-center justify-center rounded bg-black/70 text-white",
                        brushBuilding === b.id ? "flex" : "hidden group-hover:flex",
                      )}
                      title="Редактировать тиры"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Постройка может стоять на карте: без зачистки в клетке
                        // остался бы мёртвый id и пустое окно у игрока.
                        const onMap = Object.entries(cells).filter(
                          ([, c]) => c.buildingId === b.id,
                        );
                        const warn = onMap.length
                          ? `«${b.name}» стоит на карте (${onMap.length} кл.). Удалить шаблон и убрать её с этих клеток?`
                          : `Удалить постройку «${b.name}»?`;
                        if (confirm(warn)) {
                          if (onMap.length > 0) {
                            applyPatches(
                              onMap.map(([k, c]) => ({
                                k,
                                prev: c,
                                next: { ...c, buildingId: null },
                              })),
                            );
                          }
                          adminDeleteItem({ data: { id: b.id } })
                            .then(() => {
                              buildingQ.refetch();
                              if (brushBuilding === b.id) setBrushBuilding("");
                              toast.success("Удалено");
                            })
                            .catch((err) =>
                              toast.error(err instanceof Error ? err.message : "Ошибка"),
                            );
                        }
                      }}
                      className={cn(
                        "absolute right-0 top-0 z-10 h-4 w-4 items-center justify-center rounded bg-rose-600 text-white",
                        brushBuilding === b.id ? "flex" : "hidden group-hover:flex",
                      )}
                      title="Удалить"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setBrushBuilding(b.id)}
                      onDoubleClick={() => {
                        setEditingBuilding(b);
                        setBuildingEditorOpen(true);
                      }}
                      className={cn(
                        "flex flex-col items-center gap-0.5 rounded p-0.5 transition",
                        brushBuilding === b.id
                          ? "bg-gold/10 ring-2 ring-gold"
                          : "hover:bg-secondary/40",
                      )}
                      title={`${b.name} — двойной тап: правка`}
                    >
                      <div className="h-9 w-9 overflow-hidden rounded border border-border bg-secondary/30">
                        {b.imageUrl ? (
                          <img
                            src={thumb(b.imageUrl, 160, "black")}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-[8px] text-muted-foreground">
                            нет
                          </span>
                        )}
                      </div>
                      <span className="max-w-[46px] truncate text-[9px]">{b.name}</span>
                    </button>
                  </div>
                ))}
              </>
            )}
            {mode === "decoration" && (
              <>
                {/* + Добавить декор — всегда первый */}
                <button
                  onClick={() => {
                    setEditingDecor(null);
                    setDecorEditorOpen(true);
                  }}
                  className="flex flex-none flex-col items-center gap-0.5 rounded p-0.5 transition hover:bg-secondary/40"
                  title="Добавить тип декора"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded border-2 border-dashed border-gold/50">
                    <Plus className="h-4 w-4 text-gold" />
                  </div>
                  <span className="text-[9px] text-gold">Добавить</span>
                </button>
                {/* Без декора — стирает декор с клетки, местность не трогает */}
                <button
                  onClick={() => {
                    setBrushDecoration("");
                  }}
                  className={cn(
                    "flex flex-none flex-col items-center gap-0.5 rounded p-0.5 transition",
                    brushDecoration === ""
                      ? "bg-gold/10 ring-2 ring-gold"
                      : "hover:bg-secondary/40",
                  )}
                  title="Без декора (стереть)"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded border border-border bg-secondary/30">
                    <Eraser className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-[9px] text-muted-foreground">Убрать</span>
                </button>
                {decorations.map((d) => {
                  // Как у местности: кнопки у выбранной кисти, без тогла.
                  const isSelected = brushDecoration === d.id;
                  return (
                    <div
                      key={d.id}
                      className="group relative flex flex-none flex-col items-center gap-0.5 rounded p-0.5"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingDecor(d);
                          setDecorEditorOpen(true);
                        }}
                        className={cn(
                          "absolute left-0 top-0 z-10 h-4 w-4 items-center justify-center rounded bg-black/70 text-white",
                          isSelected ? "flex" : "hidden group-hover:flex",
                        )}
                        title="Редактировать"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Удалить «${d.label}»?`)) {
                            adminDeleteItem({ data: { id: d.id } })
                              .then(() => {
                                decorQ.refetch();
                                toast.success("Удалено");
                              })
                              .catch((err) =>
                                toast.error(err instanceof Error ? err.message : "Ошибка"),
                              );
                          }
                        }}
                        className={cn(
                          "absolute right-0 top-0 z-10 h-4 w-4 items-center justify-center rounded bg-rose-600 text-white",
                          isSelected ? "flex" : "hidden group-hover:flex",
                        )}
                        title="Удалить"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => {
                          setBrushDecoration(d.id);
                        }}
                        className={cn(
                          "flex flex-none flex-col items-center gap-0.5 rounded transition",
                          brushDecoration === d.id
                            ? "bg-gold/10 ring-2 ring-gold"
                            : "hover:bg-secondary/40",
                        )}
                        title={d.label}
                      >
                        {d.file ? (
                          <img src={thumb(d.file, 160)} alt="" className="h-9 w-9 object-contain" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded bg-secondary/30">
                            <TreePine className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="max-w-[52px] truncate text-[9px] text-muted-foreground">
                          {d.label}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </>
            )}
            {mode === "road" && (
              <>
                {/* + Добавить дорогу — всегда первый */}
                <button
                  onClick={() => {
                    setEditingRoad(null);
                    setRoadEditorOpen(true);
                  }}
                  className="flex flex-none flex-col items-center gap-0.5 rounded p-0.5 transition hover:bg-secondary/40"
                  title="Добавить тип дороги"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded border-2 border-dashed border-gold/50">
                    <Plus className="h-4 w-4 text-gold" />
                  </div>
                  <span className="text-[9px] text-gold">Добавить</span>
                </button>
                {roads.map((r) => (
                  <div
                    key={r.id}
                    className="group relative flex flex-none flex-col items-center gap-0.5 rounded p-0.5"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingRoad(r);
                        setRoadEditorOpen(true);
                      }}
                      className={cn(
                        "absolute left-0 top-0 z-10 h-4 w-4 items-center justify-center rounded bg-black/70 text-white",
                        brushRoad === r.id ? "flex" : "hidden group-hover:flex",
                      )}
                      title="Редактировать"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Удалить «${r.label}»?`)) {
                          adminDeleteItem({ data: { id: r.id } })
                            .then(() => {
                              roadQ.refetch();
                              toast.success("Удалено");
                            })
                            .catch((err) =>
                              toast.error(err instanceof Error ? err.message : "Ошибка"),
                            );
                        }
                      }}
                      className={cn(
                        "absolute right-0 top-0 z-10 h-4 w-4 items-center justify-center rounded bg-rose-600 text-white",
                        brushRoad === r.id ? "flex" : "hidden group-hover:flex",
                      )}
                      title="Удалить"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setBrushRoad(r.id)}
                      className={cn(
                        "flex flex-none flex-col items-center gap-0.5 rounded transition",
                        brushRoad === r.id
                          ? "bg-gold/10 ring-2 ring-gold"
                          : "hover:bg-secondary/40",
                      )}
                    >
                      {/* Превью — сам PNG миниатюрой, как у местности. Раньше
                          адрес картинки клали в background-ЦВЕТ: браузер такой
                          цвет не понимает, и палитра дорог была рядом пустых
                          гексов — выбирать приходилось по подписи. */}
                      {r.file ? (
                        <img
                          src={thumb(r.file, 256)}
                          alt=""
                          className="h-9 w-9 object-cover"
                          style={{
                            clipPath: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)",
                          }}
                        />
                      ) : (
                        <div
                          className="h-9 w-9"
                          style={{
                            background: "#c9a267",
                            clipPath: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)",
                          }}
                        />
                      )}
                      <span className="max-w-[52px] truncate text-[9px] text-muted-foreground">
                        {r.label}
                      </span>
                    </button>
                  </div>
                ))}
              </>
            )}
            {mode === "object" && (
              <>
                {/* Sub-табики (Боссы/Мобы/Артефакты/Сундук) */}
                <div className="flex flex-none flex-col gap-1 pr-1">
                  {OBJECT_SUBS.map((s) => {
                    const Icon = s.icon;
                    const on = objectSub === s.key;
                    return (
                      <button
                        key={s.key}
                        onClick={() => {
                          setObjectSub(s.key);
                          // если у sub есть выбранный ассет — восстановим, иначе первый
                          const list = assetsBySub[s.key];
                          if (s.key === "chest" || s.key === "mine") setBrushObject(s.key);
                          else if (list[0]) setBrushObject(`${s.key}:${list[0].id}`);
                        }}
                        className={cn(
                          "flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-bold transition",
                          on ? "bg-secondary" : "text-muted-foreground",
                        )}
                        title={s.label}
                        style={on ? { color: s.color } : undefined}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mx-1 h-full w-px bg-border" />
                {/* Фильтр + ассеты выбранного sub */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {/* Фильтр по слоту (только артефакты) */}
                  {objectSub === "artifact" && slotOptions.length > 0 && (
                    <select
                      value={filterSlot ?? ""}
                      onChange={(e) => setFilterSlot(e.target.value || null)}
                      className="w-full rounded border border-border bg-secondary/40 px-1.5 py-0.5 text-[10px] text-foreground"
                    >
                      <option value="">Все слоты</option>
                      {slotOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  )}
                  {landOptions.length > 0 && (
                    <select
                      value={filterLand ?? ""}
                      onChange={(e) => setFilterLand(e.target.value || null)}
                      className="w-full rounded border border-border bg-secondary/40 px-1.5 py-0.5 text-[10px] text-foreground"
                    >
                      <option value="">Все локации</option>
                      {landOptions.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {/* Ассеты — горизонтально, скролл */}
                  <div className="flex gap-1 overflow-x-auto">
                    {/* + Добавить — всегда первый */}
                    <button
                      onClick={() => setInlineCreate(objectSub)}
                      className="flex flex-none flex-col items-center gap-0.5 rounded p-0.5 transition hover:bg-secondary/40"
                      title={`Добавить ${OBJECT_SUBS.find((s) => s.key === objectSub)?.label.toLowerCase()}`}
                    >
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded border-2 border-dashed"
                        style={{
                          borderColor: OBJECT_SUBS.find((s) => s.key === objectSub)?.color + "88",
                        }}
                      >
                        <Plus
                          className="h-4 w-4"
                          style={{ color: OBJECT_SUBS.find((s) => s.key === objectSub)?.color }}
                        />
                      </div>
                      <span className="text-[9px] text-gold">Добавить</span>
                    </button>
                    {(assetsBySub[objectSub] ?? []).map((a) => {
                      const objId = `${objectSub}:${a.id}`;
                      const on = brushObject === objId;
                      const sub = OBJECT_SUBS.find((s) => s.key === objectSub)!;
                      return (
                        <div
                          key={objId}
                          className="group relative flex flex-none flex-col items-center gap-0.5 rounded p-0.5"
                        >
                          {/* Карандаш — редактирование */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditTarget({
                                key: "palette",
                                cell: { terrainId: null, objectId: objId },
                              });
                            }}
                            className={cn(
                              "absolute left-0 top-0 z-10 h-4 w-4 items-center justify-center rounded bg-black/70 text-white",
                              on ? "flex" : "hidden group-hover:flex",
                            )}
                            title="Редактировать"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          {/* Крест — удаление */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Босс живёт в своей таблице и удаляется своим
                              // окном — там видно, сколько копий стоит на
                              // картах, и есть галочка «убрать их заодно».
                              // Раньше крестик звал adminDeleteItem, тот искал
                              // босса среди предметов и отвечал «не найден»:
                              // удалить босса отсюда было нельзя вовсе.
                              if (objectSub === "boss") {
                                setDelBossTpl({ id: a.id, name: a.name });
                                return;
                              }
                              if (confirm(`Удалить «${a.name}»?`)) {
                                adminDeleteItem({ data: { id: a.id } })
                                  .then(() => {
                                    qc.invalidateQueries({ queryKey: ["hex-editor-items"] });
                                    qc.invalidateQueries({
                                      queryKey: ["hex-editor-boss-templates"],
                                    });
                                    toast.success("Удалено");
                                  })
                                  .catch((err) =>
                                    toast.error(err instanceof Error ? err.message : "Ошибка"),
                                  );
                              }
                            }}
                            className={cn(
                              "absolute right-0 top-0 z-10 h-4 w-4 items-center justify-center rounded bg-rose-600 text-white",
                              on ? "flex" : "hidden group-hover:flex",
                            )}
                            title="Удалить"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setBrushObject(objId)}
                            className={cn(
                              "flex flex-none flex-col items-center gap-0.5 rounded transition",
                              on ? "bg-gold/10 ring-2 ring-gold" : "hover:bg-secondary/40",
                            )}
                            title={a.name}
                          >
                            {a.imageUrl ? (
                              <img
                                src={thumb(a.imageUrl, 80)}
                                alt={a.name}
                                className="h-9 w-9 rounded object-cover"
                                style={{ boxShadow: `0 0 0 1.5px ${sub.color}88` }}
                              />
                            ) : (
                              <span
                                className="grid h-9 w-9 place-items-center rounded"
                                style={{ background: sub.color + "22" }}
                              >
                                {sub.emoji}
                              </span>
                            )}
                            <span className="max-w-[52px] truncate text-[9px] text-muted-foreground">
                              {a.name}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Canvas — растягивается на всё оставшееся */}
      <div
        ref={wrapRef}
        className="relative flex-1 select-none overflow-hidden"
        style={{ touchAction: "none", overscrollBehavior: "contain" }}
      >
        <canvas
          ref={canvasRef}
          className="pointer-events-auto block h-full w-full"
          style={{ touchAction: "none" }}
        />
        {/* Размер кисти — левый верхний угол (местность, декор, ластик) */}
        {buildingCell && (
          <BuildingCellEditor
            q={buildingCell.q}
            r={buildingCell.r}
            mapId={currentMapId}
            building={(() => {
              const b = buildings.find((x) => x.id === buildingCell.id);
              if (!b) return null;
              const tiers = (
                (b.meta as { tiers?: Array<{ imageUrl?: string | null }> } | null)?.tiers ?? []
              )
                .map((t) => t?.imageUrl)
                .filter((u): u is string => !!u);
              return {
                id: b.id,
                name: b.name,
                tierImages: tiers,
                effect: buildingEffect(b.meta ?? null, b.name),
              };
            })()}
            tokens={tokenSymbols}
            prices={(() => {
              const cfg = cells[buildingCell.key]?.buildingConfig ?? null;
              const b = buildings.find((x) => x.id === buildingCell.id);
              const eff = b ? buildingEffect(b.meta ?? null, b.name) : null;
              // У покоев цена лежит под своим ключом (chambersPrices), у
              // дерева — под levelPrices. Одну и ту же вьюшку кормим тем
              // списком, что относится к этому эффекту.
              return eff === "chambers" ? chambersPricesDraft(cfg) : treePricesDraft(cfg);
            })()}
            signText={signText(cells[buildingCell.key]?.buildingConfig ?? null)}
            mineConfig={mineConfigDraft(cells[buildingCell.key]?.buildingConfig ?? null)}
            fieldConfig={fieldConfigDraft(cells[buildingCell.key]?.buildingConfig ?? null)}
            onFieldConfigChange={(next: FieldConfig) => {
              // Конфиг грядки живёт своим ключом `field`: соседние настройки
              // клетки (цены дерева, надпись, шахта, портал) не трогаем.
              const prev = cells[buildingCell.key];
              if (!prev) return;
              const base = (prev.buildingConfig ?? {}) as Record<string, unknown>;
              const nextCell: Cell = { ...prev, buildingConfig: { ...base, field: next } };
              applyPatches([{ k: buildingCell.key, prev, next: nextCell }]);
            }}
            boostConfig={boostConfigDraft(cells[buildingCell.key]?.buildingConfig ?? null)}
            onBoostConfigChange={(next: BoostCellConfig) => {
              // Настройка алтаря живёт своим ключом `boost` — соседние ключи
              // клетки (цены дерева, надпись, шахта, портал) не трогаем.
              const prev = cells[buildingCell.key];
              if (!prev) return;
              const base = (prev.buildingConfig ?? {}) as Record<string, unknown>;
              const nextCell: Cell = { ...prev, buildingConfig: { ...base, boost: next } };
              applyPatches([{ k: buildingCell.key, prev, next: nextCell }]);
            }}
            portalConfig={readPortalConfig(cells[buildingCell.key]?.buildingConfig ?? null, true)}
            onPortalConfigChange={(next: PortalConfig) => {
              // Настройка портала живёт в building_config отдельным ключом
              // `portal`: соседние ключи (цены дерева, надпись, шахта) правка
              // не трогает — их пишет тот же конфиг клетки.
              const prev = cells[buildingCell.key];
              if (!prev) return;
              const base = (prev.buildingConfig ?? {}) as Record<string, unknown>;
              const nextCell: Cell = {
                ...prev,
                buildingConfig: { ...base, portal: next },
              };
              applyPatches([{ k: buildingCell.key, prev, next: nextCell }]);
            }}
            onMineConfigChange={(next: MineConfig) => {
              // Конфиг шахты живёт плоско на клетке рядом с ценами/надписью —
              // слияние, а не замена, иначе правка стёрла бы соседние ключи.
              // Ту же плоскую форму читает SQL raid_mine_settle.
              const prev = cells[buildingCell.key];
              if (!prev) return;
              const token = next.resource === "token" ? next.token : null;
              // Снимаем прежний token: сменили ресурс с токена на золото — старый
              // символ не должен остаться в конфиге и сбить SQL-начисление.
              const { token: _drop, ...rest } = (prev.buildingConfig ?? {}) as Record<
                string,
                unknown
              >;
              void _drop;
              const cfg: Record<string, unknown> = {
                ...rest,
                resource: next.resource,
                yield: next.yield,
                captureCost: next.captureCost,
                ...(token ? { token } : {}),
              };
              const nextCell: Cell = {
                ...prev,
                buildingConfig: Object.keys(cfg).length > 0 ? cfg : null,
              };
              applyPatches([{ k: buildingCell.key, prev, next: nextCell }]);
            }}
            onSignTextChange={(next) => {
              // Надпись живёт на клетке рядом с ценами дерева: пишем слиянием,
              // иначе правка одного поля стирала бы другое.
              const prev = cells[buildingCell.key];
              if (!prev) return;
              const cfg = { ...(prev.buildingConfig ?? {}), text: next };
              if (!next.trim()) delete cfg.text;
              const nextCell: Cell = {
                ...prev,
                buildingConfig: Object.keys(cfg).length > 0 ? cfg : null,
              };
              applyPatches([{ k: buildingCell.key, prev, next: nextCell }]);
            }}
            onPricesChange={(next) => {
              // Цена живёт на клетке: одно «Древо знания» может стоить
              // по-разному в разных местах карты.
              const prev = cells[buildingCell.key];
              if (!prev) return;
              // Пишем как есть, вместе с недозаполненными строками: иначе
              // только что добавленный вариант (сумма ещё 0) исчезал сразу.
              // Нули отбрасываются при чтении — и в игре, и при сохранении.
              // Слияние, а не замена: рядом в конфиге живёт надпись таблички,
              // и «сохранить цену» не должно её стирать.
              const rest = { ...(prev.buildingConfig ?? {}) } as Record<string, unknown>;
              const b = buildings.find((x) => x.id === buildingCell.id);
              const eff = b ? buildingEffect(b.meta ?? null, b.name) : null;
              const key = eff === "chambers" ? "chambersPrices" : "levelPrices";
              delete rest[key];
              const merged = next.length > 0 ? { ...rest, [key]: next } : rest;
              const nextCell: Cell = {
                ...prev,
                buildingConfig: Object.keys(merged).length > 0 ? merged : null,
              };
              applyPatches([{ k: buildingCell.key, prev, next: nextCell }]);
            }}
            onEditObject={
              cells[buildingCell.key]?.objectId
                ? () => {
                    const cellData = cells[buildingCell.key];
                    setBuildingCell(null);
                    if (cellData) setEditTarget({ key: buildingCell.key, cell: cellData });
                  }
                : null
            }
            onEditTemplate={() => {
              const b = buildings.find((x) => x.id === buildingCell.id) ?? null;
              setEditingBuilding(b);
              setBuildingEditorOpen(true);
              setBuildingCell(null);
            }}
            onRemove={() => {
              const prev = cells[buildingCell.key];
              if (prev) {
                const next: Cell = { ...prev, buildingId: null };
                applyPatches([{ k: buildingCell.key, prev, next }]);
              }
              setBuildingCell(null);
              toast.success("Постройка снята с клетки");
            }}
            onClose={() => setBuildingCell(null)}
          />
        )}
        {buildingEditorOpen && (
          <BuildingEditor initial={editingBuilding} onClose={() => setBuildingEditorOpen(false)} />
        )}

        {(mode === "terrain" || mode === "decoration" || mode === "erase") && (
          <div
            data-brush-selector="true"
            className="pointer-events-auto absolute left-2 top-2 z-50 flex flex-col items-center gap-1 rounded-lg bg-black/70 p-2 backdrop-blur"
          >
            <span className="text-[10px] text-muted-foreground">Кисть</span>
            <div className="flex flex-col gap-0.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                <button
                  key={s}
                  onClick={(e) => {
                    e.stopPropagation();
                    setBrushSize(s);
                  }}
                  className={cn(
                    "h-5 w-5 rounded text-[10px] font-bold transition",
                    brushSize === s
                      ? "bg-gold text-gold-foreground"
                      : "bg-secondary/40 text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Панель биом-генератора — только пока выделение не пусто. Плавает
            над картой, поэтому лежит ВНУТРИ канвасной обёртки (иначе
            native-обработчик тапов сожрал бы её клики: см. onCanvas). */}
        {selectedForGen.size > 0 && (
          <BiomeGenPanel
            count={selectedForGen.size}
            hasPreview={genPreviewPatches.size > 0}
            terrains={terrains}
            onGenerate={runBiomeGenerator}
            onApply={applyBiomeGenerator}
            onReset={resetBiomeGenerator}
          />
        )}
        {/* Подсказка + бейдж */}
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-col items-center gap-1">
          <div className="rounded-full bg-black/70 px-3 py-1 text-[11px] text-muted-foreground">
            {mode === "terrain"
              ? "Тап — нарисовать местность"
              : mode === "road"
                ? tapA
                  ? "Тап B — проведу дорогу"
                  : "Тап A → тап B (дорога)"
                : mode === "object"
                  ? "Тап по ячейке — поставить"
                  : mode === "decoration"
                    ? "Тап — нанести декор (только по местности)"
                    : mode === "building"
                      ? brushBuilding
                        ? "Тап — поставить постройку (только по местности)"
                        : "Тап — снять постройку"
                      : "Тап — стереть"}
          </div>
          <div className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-muted-foreground tabular-nums">
            {Object.keys(cells).length} · x{scale.toFixed(1)} · {size}×{size}
          </div>
        </div>
      </div>

      {libraryOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setLibraryOpen(false)}
        >
          <div
            className="flex h-[100dvh] w-full max-w-md flex-col overflow-hidden border border-gold/30 bg-card sm:h-auto sm:max-h-[80vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm font-bold text-gold">
                <Folder className="h-4 w-4" /> Мои карты
              </div>
              <button
                onClick={() => setLibraryOpen(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              <button
                onClick={newMap}
                className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold/15 py-2 text-sm font-bold text-gold"
              >
                <Plus className="h-4 w-4" /> Новая карта
              </button>
              {library.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Библиотека пуста — сохрани карту, чтобы она появилась здесь
                </div>
              ) : (
                library.map((m) => {
                  const isCur = m.id === currentMapId;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-2",
                        isCur ? "border-gold/60 bg-gold/5" : "border-border bg-secondary/20",
                      )}
                    >
                      <button onClick={() => openMap(m)} className="min-w-0 flex-1 text-left">
                        <div className="truncate text-sm font-bold">
                          {m.name}
                          {isCur && <span className="ml-1 text-[10px] text-gold">· открыто</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {m.size}×{m.size} · {Object.keys(m.cells).length} ячеек ·{" "}
                          {new Date(m.updatedAt).toLocaleString()}
                        </div>
                      </button>
                      <button
                        onClick={() => renameMap(m.id)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                        title="Переименовать"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteMap(m.id)}
                        className="rounded p-1 text-rose-400 hover:text-rose-300"
                        title="Удалить"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t border-border p-2 text-[10px] text-muted-foreground">
              Хранится в браузере (localStorage). Для сервера — кнопка «Сервер» в тулбаре.
            </div>
          </div>
        </div>
      )}

      {/* Серверная библиотека карт */}
      {serverLibraryOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setServerLibraryOpen(false)}
        >
          <div
            className="flex h-[100dvh] w-full max-w-md flex-col overflow-hidden border border-emerald-400/30 bg-card sm:h-auto sm:max-h-[80vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-300">
                <Server className="h-4 w-4" /> Карты на сервере
              </div>
              <button
                onClick={() => setServerLibraryOpen(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {/* + Новый шаблон — всегда первый */}
              <button
                onClick={() => {
                  setServerLibraryOpen(false);
                  toast.message("Создай карту и нажми «Шаблон»");
                }}
                className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 py-2 text-sm font-bold text-emerald-300"
              >
                <Plus className="h-4 w-4" /> Новый шаблон
              </button>
              {serverMapsQ.isLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-300" />
                </div>
              )}
              {!serverMapsQ.isLoading && (serverMapsQ.data?.maps ?? []).length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  На сервере нет шаблонов — сохрани текущую кнопкой «Шаблон»
                </div>
              )}
              {(serverMapsQ.data?.maps ?? []).map((m) => {
                const isCur = serverMapId === m.id;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2",
                      isCur
                        ? "border-emerald-400/60 bg-emerald-400/5"
                        : "border-border bg-secondary/20",
                    )}
                  >
                    <button
                      onClick={() => loadFromServer(m.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm font-bold">
                        {m.name}
                        {isCur && (
                          <span className="ml-1 text-[10px] text-emerald-300">· открыто</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {m.size}×{m.size} · {new Date(m.updated_at).toLocaleString()}
                        {m.location_id && (
                          <span className="ml-1 text-gold">· привязана к локации</span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Удалить с сервера?")) deleteFromServer.mutate(m.id);
                      }}
                      className="rounded p-1 text-rose-400 hover:text-rose-300"
                      title="Удалить"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border p-2 text-[10px] text-muted-foreground">
              Хранится в PostgreSQL (raid_maps / raid_map_cells).
            </div>
          </div>
        </div>
      )}

      {/* Выбор карты для бета-рейда */}
      {betaRaidSelectorOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-stretch justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setBetaRaidSelectorOpen(false)}
        >
          <div
            className="flex h-[100dvh] w-full max-w-md flex-col overflow-hidden border border-rose-400/30 bg-card sm:h-auto sm:max-h-[80vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-sm font-bold text-rose-300">
                <Swords className="h-4 w-4" /> Выбери карту для бета-рейда
              </div>
              <button
                onClick={() => setBetaRaidSelectorOpen(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {serverMapsQ.isLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-rose-300" />
                </div>
              )}
              {!serverMapsQ.isLoading && (serverMapsQ.data?.maps ?? []).length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  На сервере нет карт — сохрани карту кнопкой «Сохранить»
                </div>
              )}
              {(serverMapsQ.data?.maps ?? []).map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    adminSetBetaRaidMap({ data: { mapId: m.id } })
                      .then(() => {
                        toast.success(`Карта «${m.name}» установлена как бета-рейд`);
                        setBetaRaidSelectorOpen(false);
                      })
                      .catch((e) => toast.error(e instanceof Error ? e.message : "Ошибка"));
                  }}
                  className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left transition hover:bg-secondary/40"
                >
                  <Swords className="h-4 w-4 text-rose-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{m.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {m.size}×{m.size} · {new Date(m.updated_at).toLocaleString()}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
