// Данные экрана бета-рейда: карта, состояние игрока и производные от них.
//
// Карта приходит колоночно (packCells.ts) — разворачиваем её один раз на
// загрузку, а не на каждый рендер. Сама карта меняется редко (только когда
// объект повержен), поэтому держим её свежей пять минут: раньше каждый вход
// в рейд заново тянул всю карту.
import { useMemo } from "react";
import { useMapProgressive } from "./useMapProgressive";
import { useQuery } from "@tanstack/react-query";
import { getBetaRaidState } from "@/server/api/beta-raid";
// Только тип: import type стирается при сборке, серверный модуль в браузер не едет.
import type { HeroMapState } from "@/server/api/beta-raid/move-hero-state";
import { voidKeys, type Cell, type PackedCells } from "./unpackMap";
import { MapStore } from "./mapStore";
import { gridOrigin } from "./hexGeometry";
import { useVoidBypass } from "./useVoidBypass";

export type TerrainInfo = {
  id: string;
  name: string;
  imageUrl: string | null;
  cost: number;
};
export type ObjectInfo = {
  id: string;
  name: string;
  imageUrl: string | null;
  meta: unknown;
  /** Вид из шаблона: boss / chest / artifact / mine — по нему решаем, вести ли в бой. */
  kind: string | null;
};

export type MapData = {
  /** main — главный мир, там замок; снимок до этажей поля не несёт. */
  map: { id: string; name: string; size: number; main?: boolean } | null;
  packed: PackedCells | null;
  terrains: Record<string, TerrainInfo>;
  objects: Record<string, ObjectInfo>;
  decorations: Record<string, { id: string; name: string; imageUrl: string | null }>;
  roads: Record<string, TerrainInfo>;
  /** Постройки: шаблон с цепочкой тиров (картинка, цена, требования). */
  buildings?: Record<
    string,
    { id: string; name: string; tiers?: Array<{ name?: string; imageUrl?: string | null }> }
  >;
  /** Текущий тир построек: "q,r" → номер. */
  buildingTiers?: Record<string, number>;
  /** Клетки-двери «q,r»: маршрут их обходит, плата берётся только шагом в них. */
  doors?: string[];
  /** «core» — приехало ядро вокруг героя; полная карта догрузится фоном. */
  scope?: "core" | "full";
};

export type RaidState = {
  position: { q: number; r: number } | null;
  energy: number;
  maxEnergy: number;
  mapId: string | null;
  slowExtra?: number;
  /** Спрайт расы героя игрока — вид фигурки на карте. */
  heroSprite?: string | null;
  /**
   * Что герой даёт на карте: обзор, скидку на шаг, признак замка. Поля нет
   * вовсе, пока флаг hero_power закрыт — по нему и определяется режим героя.
   */
  hero?: HeroMapState;
  /** Что висит прямо сейчас: замедление на игроке, яд/оглушение на фишках. */
  effects?: {
    /**
     * rows — все активные замедления аккаунта: сильнейшее не обязано быть
     * самым долгим, и по одному числу клиент обнулил бы надбавку раньше, чем
     * сервер перестал её списывать (старый ответ из кэша идёт без rows).
     */
    slow: {
      value: number;
      expiresAt: string;
      rows?: Array<{ value: number; expiresAt: string; source?: string | null }>;
      /** Кто повесил. Старый кэш поля не знает — безопасно. */
      source?: string | null;
    } | null;
    chips: Array<{
      chipId: string;
      kind: "poison" | "stun";
      name: string | null;
      level: number;
      expiresAt: string;
      source?: string | null;
    }>;
    /** Ослабления героя: вид, сколько пунктов сбито, когда отпустит, от кого. */
    weaken?: Array<{ kind: string; value: number; expiresAt: string; source?: string | null }>;
    /** Бусты: то же поле, только со знаком «+». Старый кэш его не знает. */
    buff?: Array<{ kind: string; value: number; expiresAt: string; source?: string | null }>;
  };
};

export function useBetaRaidData() {
  // Карта: снимок с версией + дельты живого канала (useMapProgressive).
  const mapQ = useMapProgressive();
  const stateQ = useQuery({
    queryKey: ["beta-raid-state"],
    queryFn: () => getBetaRaidState() as Promise<RaidState>,
  });

  // Админу купол в клетки не кладём вовсе: по ТЗ под ним он работает как без
  // него. Это ЕДИНСТВЕННОЕ место обхода на клиенте — дальше правила ходьбы,
  // тапа и соседей ничего про права не знают.
  const bypassVoid = useVoidBypass();

  // Клетки — только из карты. Списки «повержено/снято» из опроса игроков
  // больше не подмешиваются: у карты есть версия, и кто жив, а кто снят,
  // говорит её дельта (сервер читает правду из базы, map-change-hooks).
  // Раньше три источника сводились немонотонно, и исчезновение ключа из
  // списка воскрешало объект — те самые «призраки» после уборки.
  // Карта в памяти — колонки и сетка (mapStore), без объекта на клетку.
  // `cells` — словарь-Proxy поверх колонок для старого кода (тап, соседи).
  const size = mapQ.data?.map?.size ?? 0;
  const store = useMemo(() => {
    const packed = mapQ.data?.packed;
    if (!packed) return null;
    const { centerQ, c0q } = gridOrigin(size);
    return new MapStore(packed, centerQ, c0q, bypassVoid);
  }, [mapQ.data?.packed, size, bypassVoid]);
  const cells: Record<string, Cell> = useMemo(() => store?.cells ?? {}, [store]);

  // Ключи зоны отдельным набором: у админа флага на клетках нет, а подсветить
  // купол и вырезать зону из тумана войны надо и ему. Ссылка стабильна —
  // кадр карты просыпается на новую ссылку Set.
  const domeCells = useMemo(() => voidKeys(mapQ.data?.packed), [mapQ.data?.packed]);

  return { mapQ, stateQ, cells, domeCells, store };
}
