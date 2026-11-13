// /portal-check — сверка порталов (владелец, 30.10.2026): только чтение, для
// Ангелины и админов (сервер пускает редактора замка). Ссылки в меню нет —
// страницу открывают по адресу.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PortalWorldCard } from "@/components/portal-check/PortalWorldCard";
import { getPortalCheck } from "@/server/api/beta-raid/portal-check";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/portal-check")({
  head: () => ({ meta: [{ title: "Portal check — YupLink" }] }),
  component: PortalCheckPage,
});

function PortalCheckPage() {
  const t = useT();
  // 'view' вторым сегментом — ответ не сохраняется в постоянный кэш устройства.
  const q = useQuery({
    queryKey: ["portal-check", "view"],
    queryFn: () => getPortalCheck(),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-6">
        <h1 className="mb-4 font-display text-2xl font-bold">{t("pcheck.title")}</h1>
        {q.isPending ? (
          <div className="flex items-center gap-2 text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("pcheck.loading")}
          </div>
        ) : q.isError ? (
          <p role="alert" className="text-destructive">
            {t("pcheck.error")}: {humanError(q.error)}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {q.data.worlds.map((w) => (
              <PortalWorldCard key={w.name} world={w} />
            ))}
            {q.data.islands.count > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("pcheck.islands", { n: q.data.islands.count, to: q.data.islands.to })}
              </p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
