// Охранник сундука для окна: полный вид (HP, урон, способности), если сервер
// положил его в ответ окна (сеть владельца), иначе — то, что знает слой охраны
// карты (getMineGuards: имя и картинка). Охрана сундука — та же raid_mine_guard.
import { useQuery } from "@tanstack/react-query";
import { fetchMineGuards } from "@/components/beta-raid/mine/mineGuardsQuery";

/** То, что рисуют MineGuardFight и блок охраны владельца. */
export type ChestGuard = {
  name: string;
  image: string | null;
  background: string | null;
  maxHp: number;
  currentHp: number;
  damage: string | null;
  /** Только имя и картинка из слоя охраны — HP неизвестно. */
  partial?: boolean;
  abilities?: Array<{
    kind: string;
    chance: number;
    value: string | number;
    duration: string | number;
  }>;
};

/** Ответ окна (сеть владельца), в котором может ехать охранник клетки. */
type GuardCarrier = { slots: unknown; guard?: ChestGuard | null };
type GuardLite = { name: string; image: string | null };

/**
 * Охранник клетки: явный ответ окна важнее (null там — «охраны нет»); нет
 * поля — берём живого из слоя охраны. HP слой не знает: ставим 1/1, чтобы
 * полоса боя не делила на ноль; настоящее HP покажет итог удара.
 */
export function guardOf(
  view: GuardCarrier | undefined,
  lite: GuardLite | undefined,
): ChestGuard | null {
  if (view && view.guard !== undefined) return view.guard;
  if (!lite) return null;
  return {
    name: lite.name,
    image: lite.image,
    background: null,
    maxHp: 1,
    currentHp: 1,
    damage: null,
    partial: true,
  };
}

/** Живая охрана карты (тот же ключ и опрос, что у слоя на канвасе). */
export function useGuardLite(
  q: number,
  r: number,
): { lite: GuardLite | undefined; ready: boolean } {
  const guards = useQuery({
    queryKey: ["beta-raid-mine-guards"],
    queryFn: ({ client }) => fetchMineGuards(client),
    staleTime: 30_000,
  });
  return { lite: guards.data?.guards[`${q},${r}`], ready: !guards.isLoading };
}
