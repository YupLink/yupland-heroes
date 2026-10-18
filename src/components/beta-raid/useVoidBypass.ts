// Проходит ли этот игрок сквозь глухой туман.
//
// Право спрашиваем у сессии, а не у флага в браузере: `isAdmin` считает тот же
// ADMIN_WALLETS, что и серверные гейты (voidGate.canIgnoreVoid), — клиент и
// сервер отвечают одинаково, и «прошёл на карте, отбило на сервере» не
// случается. Сессия к этому моменту уже в кэше — лишнего запроса нет.
//
// Применяется РОВНО в одном месте (useBetaRaidData → unpackCells): купол
// просто не появляется в клетках админа, и правила проходимости про него не
// знают вовсе. Показ картой это не трогает — зону админу по-прежнему
// подсвечивает отдельный набор ключей.
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";

export function useVoidBypass(): boolean {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  return session.data?.isAdmin === true;
}
