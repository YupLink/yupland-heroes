import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { disconnectWallet, getSession } from "@/server/api/user-auth";
import { useAppStore } from "@/lib/store";
import { LogOut, Menu, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminNavGroups, adminFooterItems } from "@/lib/adminNav";
import { AdminLoading, AdminOffline, AdminNoAccess } from "@/components/admin/AdminGate";

export const Route = createFileRoute("/admin")({
  // Auth-гейт на уровне роутера (ДО рендера). Раньше не-админа разворачивал
  // <Navigate> прямо в теле AdminLayout — рендер-редирект давал бесконечную
  // петлю обновлений (React #185) на гостевом заходе. beforeLoad-редирект
  // повторяет чистый прямой заход на /home и не рендерит AdminLayout вовсе.
  //
  // Отдельно: «нет прав» и «сервер не ответил» — это РАЗНОЕ. Раньше любой сбой
  // getSession() ронял маршрут, и при перезапуске приложения после выката
  // (Caddy отдаёт 502 без content-type) админ на КЛИЕНТСКОМ переходе на /admin
  // получал «Invariant failed» — текст из недр фетчера TanStack. Кнопка
  // «Попробовать снова» звала тот же beforeLoad и ту же ошибку.
  beforeLoad: async () => {
    // redirect в TanStack бросается ИСКЛЮЧЕНИЕМ, поэтому он обязан лететь
    // мимо try/catch — иначе catch проглотит его и пустит гостя дальше.
    let session: Awaited<ReturnType<typeof getSession>> | null = null;
    try {
      session = await getSession();
    } catch {
      // Транспорт икнул — не роняем маршрут. Гейт добьёт AdminLayout по
      // своему useQuery(["session"]), а данные и так закрыты: каждая
      // админская server-fn под requireAdmin (проверено аудитом).
      return;
    }
    if (!session?.isAdmin) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({
    meta: [
      { title: "YupLink" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const {
    data: session,
    isPending,
    isError,
    isPaused,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  const isAdmin = session?.isAdmin ?? false;
  const isPayoutsAdmin = session?.isPayoutsAdmin ?? false;

  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const qc = useQueryClient();
  const setWallet = useAppStore((s) => s.setWallet);

  const logout = useMutation({
    mutationFn: () => disconnectWallet(),
    onSuccess: () => {
      setWallet(null);
      qc.invalidateQueries();
    },
  });

  // Сессию получить не удалось — говорим об этом прямо и даём повторить.
  // Молча показать админский интерфейс тут нельзя: неизвестно, кто пришёл.
  //
  // isPaused здесь наравне с isError: react-query приостанавливает повторы,
  // пока вкладка скрыта или сети нет — status остаётся pending, а isFetching
  // гаснет. На прежнем условии isLoading такой запрос проваливался мимо
  // «загрузки» и показывал админу «нет доступа». Пауза лечится сама: вкладка
  // снова на виду — повтор продолжится.
  if (isError || isPaused) {
    return <AdminOffline onRetry={() => void refetch()} busy={isFetching} />;
  }

  if (isPending) return <AdminLoading />;

  // Обычно сюда не доходит: не-админа развернул beforeLoad. Остаётся случай,
  // когда beforeLoad пропустил из-за сбоя транспорта, а сессия уже приехала.
  if (!isAdmin) return <AdminNoAccess />;

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid opacity-30" />
      <AppHeader />
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 mt-14 w-60 transform border-r border-border/50 bg-sidebar transition-transform md:sticky md:top-14 md:translate-x-0 md:self-start",
            mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          )}
          style={{ height: "calc(100vh - 3.5rem)" }}
        >
          <div className="flex h-full flex-col p-4">
            {/* «На сайт» — в игру (замок/фишки), а не на старый лендинг /home. */}
            <Link
              to="/chips"
              className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              На сайт
            </Link>
            <nav className="flex-1 overflow-y-auto pb-2">
              {adminNavGroups
                .filter((group) => group.gate !== "payouts" || isPayoutsAdmin)
                .map((group) => (
                <div key={group.title} className="mt-5 first:mt-4">
                  <div className="mb-1.5 px-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {group.title}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const cls = (active: boolean) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                          active
                            ? "bg-gold/10 text-gold ring-gold"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        );
                      // Внешний сервис под тем же доменом — обычная ссылка,
                      // роутер про него не знает.
                      if ("href" in item) {
                        return (
                          <a key={item.href} href={item.href} className={cls(false)}>
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </a>
                        );
                      }
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMobileOpen(false)}
                          className={cls(location.pathname.startsWith(item.to))}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {/* Личное — мелким, приглушённым, под разделителем */}
            <div className="mt-auto border-t border-border/50 pt-3">
              <div className="space-y-0.5">
                {adminFooterItems.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs transition",
                        active
                          ? "bg-gold/10 text-gold"
                          : "text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
              <button
                onClick={() => logout.mutate()}
                className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Выйти
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile-toggle бокового меню: фикс top-left, поверх AppHeader.
            На desktop (md+) sidebar статический → кнопка не нужна. */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="fixed left-3 top-3 z-50 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gold/40 bg-card/95 text-gold shadow-gold backdrop-blur md:hidden"
          aria-label="Меню"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Затемнение фона когда меню открыто — клик закрывает. */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* min-w-0 критично: без него flex-1 НЕ ограничивает ширину детей по
            аллокации, и длинные inputs/select/button раздувают main за viewport. */}
        <main className="min-w-0 flex-1 px-4 py-6 pb-20 md:px-8 md:py-8 md:pb-8">
          <Outlet />
        </main>
      </div>
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}

