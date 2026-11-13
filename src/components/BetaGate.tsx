import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { getSession } from "@/server/api/user-auth";
import { BetaScreen } from "./BetaScreen";

// /wallet* всегда пропускаем сквозь гейт — иначе админ без ещё не
// поставленной cookie gd_wallet не смог бы подключить кошелёк и снять
// с себя же гейт (курица-яйцо). Сам /wallet ничего не отдаёт гостю,
// кроме формы подключения.
// /roadmap, /screens — публичные витрины (прогресс, раскадровка для
// дизайнера), их показываем даже во время закрытой беты (можно скидывать
// ссылку кому угодно).
// /archive — открытый архив картинок игры: скачать может кто угодно.
// /storage — отдельный сервис со своим подключением кошелька, сессия не нужна.
// /privacy — политика конфиденциальности: её адрес проверяет Google (вход через Google).
const ALLOW_PREFIXES = [
  "/privacy",
  "/crown",
  "/wallet",
  "/roadmap",
  "/screens",
  "/equip",
  "/beta-raid",
  "/archive",
  "/storage",
];

export function BetaGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
    staleTime: 30_000,
  });

  const betaAdminOnly = session.data?.betaAdminOnly ?? false;
  const isAdmin = session.data?.isAdmin ?? false;
  const allowed = ALLOW_PREFIXES.some((p) => location.pathname.startsWith(p));

  if (betaAdminOnly && !isAdmin && !allowed) {
    return <BetaScreen />;
  }
  return <>{children}</>;
}
