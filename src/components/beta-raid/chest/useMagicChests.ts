// Слой магических сундуков для экрана рейда: чьи сундуки где стоят и какое
// окно сундука открыто. Вынесено из BetaRaidScreen — экран и так за лимитом.
//
// Отдельным запросом, как охрана и флаги шахт: карта общая и кэшируется, а
// «мой/чужой» у каждого своё и меняется при установке и грабеже.
//
// Обычные сундуки (29.09, lib/plainChest) едут тем же ответом полем `plain` и
// сливаются в один слой с меткой plain: рисуются, тапаются и открываются тем
// же путём, окно у них своё (MagicChestOverlay → PlainChestWindow).
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChestMarks } from "@/lib/magicChest";
import { getMagicChests } from "@/server/api/beta-raid/chest/chest-list";
import { CHESTS_KEY } from "@/components/beta-raid/chest/chestLive";

export type OpenChest = { q: number; r: number; mine: boolean; name: string; plain?: boolean };

export function useMagicChests() {
  const q = useQuery({
    queryKey: CHESTS_KEY,
    queryFn: () => getMagicChests(),
    staleTime: 30_000,
  });
  // Ответ из persist-кэша прошлой версии поля plain не знает — читаем защищённо.
  const data = q.data;
  const chests = useMemo((): ChestMarks | undefined => {
    if (!data) return undefined;
    const plain = data.plain && typeof data.plain === "object" ? data.plain : {};
    const out: ChestMarks = { ...data.chests };
    for (const [key, mark] of Object.entries(plain)) out[key] = { ...mark, mine: false, plain: true };
    return out;
  }, [data]);
  const [open, setOpen] = useState<OpenChest | null>(null);

  /** Открыть окно сундука; «мой» фиксируем на открытии — после грабежа метка пропадёт, а итог остаётся. */
  const openChest = useCallback(
    (cell: { q: number; r: number }) => {
      const mark = chests?.[`${cell.q},${cell.r}`];
      if (mark) {
        setOpen({ q: cell.q, r: cell.r, mine: mark.mine, name: mark.name, plain: mark.plain });
      }
    },
    [chests],
  );

  /**
   * Прибытие маршрута «дойти и открыть» зовёт окно постройки; на клетке с
   * сундуком открываем сундук. Постройка, поставленная поверх сундука позже
   * (редактор админа), важнее — как и у тапа (chestTap).
   */
  const openOr = useCallback(
    (
      fallback: (cell: { q: number; r: number }) => void,
      built?: (cell: { q: number; r: number }) => boolean,
    ) =>
      (cell: { q: number; r: number }) => {
        if (chests?.[`${cell.q},${cell.r}`] && !built?.(cell)) openChest(cell);
        else fallback(cell);
      },
    [chests, openChest],
  );

  return { chests, open, openChest, openOr, close: () => setOpen(null) };
}
