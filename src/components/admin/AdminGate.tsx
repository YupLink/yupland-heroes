// Промежуточные состояния входа в админку: грузим сессию / сервер не ответил /
// прав нет. Вынесено из routes/admin.tsx, чтобы маршрут остался про раскладку.
//
// ЗАЧЕМ отдельное состояние «сервер не отвечает»: раньше beforeLoad ронял
// маршрут, если getSession() не долетал (перезапуск приложения за Caddy → 502
// без content-type), и админ видел «Invariant failed». Теперь маршрут не
// падает, а гейт честно говорит, что случилось, и даёт повторить. Права при
// этом не текут: каждая админская server-fn отдельно под requireAdmin.
import { useT } from "@/lib/i18n";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export function AdminLoading() {
  const t = useT();
  return <Frame>{t("common.loading")}</Frame>;
}

export function AdminOffline({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  const t = useT();
  return (
    <Frame>
      <div className="text-base font-semibold text-foreground">{t("admin.gate_offline_title")}</div>
      <p className="mt-2">{t("admin.gate_offline_text")}</p>
      <button
        onClick={onRetry}
        disabled={busy}
        className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {t("err.retry")}
      </button>
    </Frame>
  );
}

export function AdminNoAccess() {
  const t = useT();
  return (
    <Frame>
      <div className="text-base font-semibold text-foreground">{t("admin.gate_no_access")}</div>
      {/* Обычная ссылка, а не <Link>: рендер-навигация на этом маршруте уже
          давала бесконечную петлю обновлений (React #185). */}
      <a href="/" className="mt-4 inline-block text-gold underline">
        {t("err.go_home")}
      </a>
    </Frame>
  );
}
