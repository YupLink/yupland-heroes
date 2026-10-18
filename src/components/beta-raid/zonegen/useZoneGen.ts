// Состояние панели зоны: рецепт, вызов генератора, отчёт и ошибка.
//
// Клетки рисует сервер (adminZoneGenerate): опыт карты — какой декор админ
// ставил на какой местности — лежит в базе, клиент его не держит. Сюда
// приходят готовые патчи, и они ложатся в общую очередь кисти одной пачкой
// (queueCells): подсветка золотом и «Выгрузить» работают штатно.
//
// Постройки поселений едут ТОЙ ЖЕ пачкой, что и местность: разбей их на два
// queueCells — и очередь сняла бы базу клетки дважды, а «Забыть правки» уносил
// бы половину зоны.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import type { CellPatch } from "@/lib/raid/mapDelta";
import {
  ZONE_MAX_CELLS,
  defaultRecipe,
  newSeed,
  type ZoneRecipe,
  type ZoneReport,
} from "@/lib/raid/zonegen/recipe";
import type { SettlementRecipe, ZoneStructure } from "@/lib/raid/zonegen/settlement-types";
import { adminZoneGenerate } from "@/server/api/beta-raid/zonegen/generate-api";
import { readDraft } from "../adminDraftStore";
import {
  busyFromDraft,
  cellsFromKeys,
  clearPatches,
  randomRecipe,
  structureKeys,
  toCellPatches,
  toStructurePatches,
} from "./zoneGenHelpers";
import { loadRecipe, saveRecipe } from "./zoneGenStore";

/** Карта, на которой работаем: из кэша, без своего запроса. */
const mapIdOf = (qc: QueryClient): string | undefined =>
  qc.getQueryData<{ map?: { id?: string } }>(["beta-raid-map"])?.map?.id;

/** Ползунок за перетаскивание шлёт десятки правок — в локалку пишем реже. */
const SAVE_DELAY_MS = 400;

export function useZoneGen({
  selectedForGen,
  terrainIds,
  queueCells,
  discardKeys,
}: {
  /** Клетки зоны — Set ключей «q,r» (кисть «Биом»). */
  selectedForGen: Set<string>;
  /** Id местностей справочника (useAssets("terrain")), в порядке палитры. */
  terrainIds: string[];
  /** Пачка правок в очередь кисти одним коммитом. */
  queueCells: (patches: CellPatch[]) => void;
  /** Снять с очереди правки по ключам зоны. */
  discardKeys: (keys: string[]) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  // Справочник приходит запросом позже первого рендера: стартуем с пустой
  // местностью и подставляем первую, как только она появится.
  const [recipe, setRecipe] = useState<ZoneRecipe>(() => defaultRecipe(""));
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ZoneReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ключ локалки решаем один раз на монтирование: карту в режиме бога не
  // переключают из-под панели, а «плавающий» ключ читал бы одно, писал другое.
  const storeKey = useRef<string | undefined>(undefined);
  const restored = useRef(false);
  // Клетки, которые заняла ПРОШЛАЯ генерация (постройки, дороги, краска
  // города). Без этой памяти «Перегенерировать» строил второй город поверх
  // первого: новая генерация кладёт в очередь свои клетки, а чужие правки из
  // неё никто не снимал (владелец, 24.09).
  const placed = useRef<ZoneStructure[]>([]);

  // Рецепт из прошлого сеанса. Не в useState-инициализаторе: на сервере
  // локалки нет, и первый клиентский рендер разошёлся бы с разметкой.
  useEffect(() => {
    storeKey.current = mapIdOf(qc);
    const saved = loadRecipe(storeKey.current);
    if (saved) setRecipe(saved);
    restored.current = true;
  }, [qc]);

  useEffect(() => {
    if (!restored.current) return; // до восстановления писать нечего
    const id = setTimeout(() => saveRecipe(storeKey.current, recipe), SAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [recipe]);

  // Местности могли переименовать или выключить, пока рецепт лежал в локалке:
  // мёртвый слой сервер отобьёт ошибкой на весь прогон — тихо убираем его.
  useEffect(() => {
    const first = terrainIds[0];
    if (!first) return;
    const known = new Set(terrainIds);
    setRecipe((r) => {
      const alive = r.layers.filter((l) => known.has(l.terrainId));
      if (alive.length === r.layers.length) return r;
      return { ...r, layers: alive.length > 0 ? alive : [{ terrainId: first, weight: 100 }] };
    });
  }, [terrainIds]);

  /** Частичная правка рецепта — ползунки и поля зовут её напрямую. */
  const patch = useCallback((part: Partial<ZoneRecipe>) => {
    setRecipe((r) => ({ ...r, ...part }));
  }, []);

  /** Частичная правка блока поселений — он лежит внутри рецепта. */
  const patchSettlement = useCallback((part: Partial<SettlementRecipe>) => {
    setRecipe((r) => ({ ...r, settlement: { ...r.settlement, ...part } }));
  }, []);

  const generate = useCallback(
    async (seed: number = recipe.seed) => {
      const cells = cellsFromKeys(selectedForGen);
      if (cells.length === 0) {
        setError(t("zonegen.empty_selection"));
        return;
      }
      if (cells.length > ZONE_MAX_CELLS) {
        setError(t("zonegen.too_many", { max: ZONE_MAX_CELLS }));
        return;
      }
      const next = { ...recipe, seed };
      setRecipe(next);
      setBusy(true);
      setError(null);
      try {
        // Карта, на которой выделяли: сервер сверит с активной, чтобы зона с
        // чужой карты не легла по тем же координатам на живую (как adminDraft).
        const mapId = mapIdOf(qc);
        const mine = placed.current;
        // Дома и объекты, поставленные кистью руками, база ещё не видит — шлём
        // их сами, иначе генератор поставит поселение прямо на них.
        const busyCells = busyFromDraft(
          readDraft().queue,
          structureKeys(mine),
          ZONE_MAX_CELLS,
          selectedForGen,
        );
        const out = await adminZoneGenerate({
          data: { cells, recipe: next, mapId, busy: busyCells },
        });
        const structures = out.structures ?? [];
        // Снимаем с прошлого города ровно то, чего новый на этой клетке не
        // ставит (дом под новой улицей — тоже накопление), и делаем это первой
        // правкой пачки: очередь сливает правки по клетке по порядку
        // (mergeCellPatch). Дальше местность, и лишь потом постройки — дом
        // встаёт поверх своей же новой земли.
        queueCells([
          ...clearPatches(mine, structures),
          ...toCellPatches(out.patches),
          ...toStructurePatches(structures),
        ]);
        placed.current = structures;
        setReport(out.report);
      } catch (e) {
        setError(humanError(e));
      } finally {
        setBusy(false);
      }
    },
    [recipe, selectedForGen, queueCells, t, qc],
  );

  /** Тот же рецепт, новый сид: другая раскладка пятен. Фраза сида устарела. */
  const regenerate = useCallback(() => {
    setRecipe((r) => ({ ...r, seedText: undefined }));
    return generate(newSeed());
  }, [generate]);

  /** Забыть, что поставила прошлая генерация: снимать в следующий раз нечего. */
  const forgetPlaced = useCallback(() => {
    placed.current = [];
  }, []);

  /** Забыть правки зоны в очереди; отчёт больше ни о чём не говорит. */
  const discard = useCallback(() => {
    discardKeys([...selectedForGen]);
    forgetPlaced();
    setReport(null);
  }, [discardKeys, selectedForGen, forgetPlaced]);

  const random = useCallback(() => {
    setRecipe((r) => ({ ...randomRecipe(terrainIds, r), seedText: undefined }));
  }, [terrainIds]);

  /**
   * Рецепт от ИИ приходит без сида — сид остаётся прежним, крутится кнопкой.
   * Поселения ИИ не составляет: набор построек админ собирал руками, и
   * «составить рецепт» не повод его обнулять.
   */
  const applyAi = useCallback((ai: Omit<ZoneRecipe, "seed">) => {
    setRecipe((r) => ({ ...ai, seed: r.seed, seedText: r.seedText, settlement: r.settlement }));
  }, []);

  return {
    recipe,
    setRecipe,
    patch,
    patchSettlement,
    busy,
    report,
    error,
    setError,
    generate: () => void generate(),
    regenerate: () => void regenerate(),
    discard,
    forgetPlaced,
    random,
    applyAi,
  };
}
