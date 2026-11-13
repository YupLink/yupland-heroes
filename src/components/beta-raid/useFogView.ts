// Что показывать на карте: обычный туман войны, режим админа «карта открыта
// целиком» и клетки под глухим туманом, которых игрок не видит никогда.
//
// Слой поверх useFogOfWar, а не правка внутри него: раскрытие — это ТОЛЬКО
// показ. Память тумана (localStorage + `beta_raid_fog`) о кнопке не знает,
// поэтому выключение возвращает ровно то разведанное, что было до нажатия.
//
// Клетки под куполом вычёркиваем ЗДЕСЬ же, на выходе, а не внутри памяти: у
// памяти четыре входа (старый localStorage, шаг героя, сервер, вышка), и
// фильтр на выходе закрывает их разом — включая клетку, ставшую глухой уже
// после того, как игрок её разведал.
//
// Раскрытие кадру отдаётся ПРИЗНАКОМ, а не подменой разведанного на набор из
// всех 16 384 ключей: набор стоил ~3 мс на каждую правку карты и заставлял
// каждую клетку в кадре идти по дорогой ветке отрисовки. Набор ключей остался
// ровно там, где без него никак, — у миникарты и границ камеры (useAllCellKeys).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { useFogOfWar } from "./useFogOfWar";
import { useAdminFogReveal } from "./adminFogReveal";
import { useAllCellKeys } from "./useAllCellKeys";
import { isIslandMapId } from "@/lib/raid/island/ids";
import { isCreatorMapId } from "@/lib/raid/creator/ids";
import type { Bounds } from "./viewportClamp";
import type { MapStore } from "./mapStore";
import type { FogView, KeySet } from "./fogMask";

/** Пустой набор одной ссылкой: кадр карты просыпается на новую ссылку. */
const EMPTY: Set<string> = new Set();
const EMPTY_IDX: Set<number> = new Set();
const NO_FOG: FogView = {
  mask: null as unknown as FogView["mask"],
  version: -1,
  has: () => false,
  hasIndex: () => false,
  size: 0,
  [Symbol.iterator]: () => [][Symbol.iterator](),
};

/** На сколько клеток режим бога может уехать за край карты. */
const EDIT_MARGIN = 40;

export function useFogView({
  mapId,
  playerPos,
  store,
  voidCells,
  editActive = false,
}: {
  mapId: string | null;
  playerPos: { q: number; r: number } | null;
  store: MapStore | null;
  /**
   * Клетки под глухим туманом, готовым набором (useBetaRaidData.domeCells).
   * Игроку их вырезает сама маска (fogMask.hasIndex смотрит на купол),
   * админу зону надо подсветить — отдаём набор ему.
   */
  voidCells: Set<string>;
  /**
   * Режим бога: камере разрешено уехать за край карты на EDIT_MARGIN клеток —
   * владелец рисует новые области в пустоте, а не только у разведанного.
   */
  editActive?: boolean;
}): {
  /** Честно разведанное игроком (маска с версией). В режиме раскрытия НЕ подменяется. */
  seen: FogView;
  visible: Set<string>;
  visibleIdx: Set<number>;
  /** Админ смотрит карту целиком: кадр показывает всё, чего бы ни знал туман. */
  revealAll: boolean;
  /** Что показывает миникарта: разведанное либо вся карта в режиме раскрытия. */
  overview: KeySet;
  bounds: Bounds;
  /** Клетки под куполом — рисует его только админ. */
  voidCells: Set<string>;
} {
  const fog = useFogOfWar(store, mapId, playerPos);
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  // Хук зовём безусловно: право на раскрытие решает сессия с сервера (тот же
  // admin-allowlist, что и у серверных админ-функций), а не флаг в браузере.
  const revealRequested = useAdminFogReveal(mapId);
  // Право island_god (05.11.2026) — то же раскрытие на острове: туда её режим
  // бога и пускает, а без него старт острова ставить вслепую.
  const islandGod = session.data?.islandGod === true && isIslandMapId(mapId ?? "");
  // Работа креатора (07.11.2026) — голая карта под стройку: тумана нет вовсе.
  const work =
    isCreatorMapId(mapId) && (session.data?.creator === true || Boolean(session.data?.isAdmin));
  const revealAll = work || ((Boolean(session.data?.isAdmin) || islandGod) && revealRequested);

  // Набор всех ключей считается ТОЛЬКО в режиме раскрытия: миникарте и
  // границам камеры он нужен, а кадру — нет. Это взгляд на колонки, без
  // 82 тысяч строк.
  const allCells = useAllCellKeys(store, revealAll);
  const isAdmin = Boolean(session.data?.isAdmin);

  const seen = fog.seen ?? NO_FOG;
  const bounds = useMemo((): Bounds => {
    if ((!revealAll && !editActive) || !store) return fog.bounds;
    const g = store.geom;
    if (store.n === 0) return null;
    // Запас за краем: игроку-админу хватает клетки, режиму бога — поля под
    // новые земли (прямоугольник/кисть за границей, см. useGenSelection).
    const m = editActive ? EDIT_MARGIN : 1;
    return {
      minQ: g.minQ - m,
      maxQ: g.minQ + g.cols + m - 1,
      minR: g.minR - m,
      maxR: g.minR + g.rows + m - 1,
    };
  }, [revealAll, editActive, store, fog.bounds]);

  return {
    seen,
    visible: fog.visible.keys.size ? fog.visible.keys : EMPTY,
    visibleIdx: fog.visible.idx.size ? fog.visible.idx : EMPTY_IDX,
    revealAll,
    overview: revealAll ? allCells : seen,
    bounds,
    voidCells: isAdmin ? voidCells : EMPTY,
  };
}
