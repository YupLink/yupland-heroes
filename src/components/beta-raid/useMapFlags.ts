// Флажки на постройках карты — одним словарём для кадра.
//
// Два источника, два запроса: флаги АККАУНТА (mine-flags.ts: шахты, поля,
// использованные деревья и статуи) и столбы заклинаний, где ВЫБРАННОМУ герою
// больше нечего взять (spell-pillar-marks.ts). Разные ключи — разная жизнь:
// ключ столбов стоит в HERO_QUERY_KEYS (lib/query.ts) и перечитывается при
// смене героя, а «spell» в его имени гасят и окно столба (изучил/забыл), и
// книга героя (забыл).
//
// Забранный столб рисуется тем же знаком, что использованное дерево/статуя —
// значение «tree» (drawBuilding: образ green-tree, та же посадка). Новых
// образов и эффектов на карте не заводим; флаг шахты или поля на той же
// клетке важнее.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMineFlags, type MineFlag } from "@/server/api/beta-raid/mine-flags";
import { getSpellPillarMarks } from "@/api";

const SPELL_PILLARS_KEY = ["beta-raid-spell-pillars"] as const;

/** Добавить «забрано» на столбы без своего флага. Нечего добавить — та же ссылка. */
export function withTakenPillars(
  flags: Record<string, MineFlag> | undefined,
  cells: unknown,
): Record<string, MineFlag> | undefined {
  // Ответ мог прийти из суточного кэша (ПРАВИЛА §11, 13в) — форму не берём на веру.
  if (!Array.isArray(cells) || cells.length === 0) return flags;
  const out: Record<string, MineFlag> = { ...flags };
  for (const key of cells) if (typeof key === "string" && !out[key]) out[key] = "tree";
  return out;
}

export function useMapFlags(): Record<string, MineFlag> | undefined {
  const mine = useQuery({
    queryKey: ["beta-raid-mine-flags"],
    queryFn: () => getMineFlags(),
    staleTime: 30_000,
  });
  const pillars = useQuery({
    queryKey: SPELL_PILLARS_KEY,
    queryFn: () => getSpellPillarMarks(),
    staleTime: 30_000,
  });
  const flags = mine.data?.flags;
  const cells = pillars.data?.cells;
  // Ссылка меняется только с данными: словарь уходит в память тумана и в кадр.
  return useMemo(() => withTakenPillars(flags, cells), [flags, cells]);
}
