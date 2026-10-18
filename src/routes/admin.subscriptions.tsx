// Админка подписки на энергию и авторассылок: тарифы (цена в $, что получает
// игрок), правила авторассылок, корзины, звёзды, пачки. Деньги двигает только
// владелец — сервер проверяет сам.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Loader2 } from "lucide-react";
import { adminEnergySubState } from "@/server/api/energy-sub/admin";
import { AdminSubTiers, ESUB_ADMIN_KEY } from "@/components/admin/esub/AdminSubTiers";
import { AdminSubMoney } from "@/components/admin/esub/AdminSubMoney";
import { AdminAutoDist } from "@/components/admin/esub/AdminAutoDist";
import { AdminSubStars } from "@/components/admin/esub/AdminSubStars";
import { AdminSubBatches } from "@/components/admin/esub/AdminSubBatches";
import { AdminSubGrant } from "@/components/admin/esub/AdminSubGrant";

export const Route = createFileRoute("/admin/subscriptions")({
  component: Page,
});

function Page() {
  const q = useQuery({
    queryKey: ESUB_ADMIN_KEY,
    queryFn: () => adminEnergySubState(),
    refetchInterval: 30_000,
  });
  const s = q.data;
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-gold" />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Админ</div>
          <h1 className="font-display text-xl font-bold">Подписка и авторассылки</h1>
        </div>
      </header>
      {!s ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {s.stats.length > 0 && (
            <div className="flex flex-wrap gap-2 text-[12px]">
              {s.stats.map((x) => (
                <span key={x.token} className="rounded-full border border-border px-2.5 py-1">
                  {x.token === "GRANT" ? (
                    <>Выдано админом: {x.subs} (активных {x.active})</>
                  ) : (
                    <>
                      {x.token}: подписок {x.subs} (активных {x.active}) · оплачено{" "}
                      {x.paid.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                    </>
                  )}
                </span>
              ))}
            </div>
          )}
          <AdminSubGrant tiers={s.tiers} />
          <AdminSubTiers tiers={s.tiers} />
          <AdminSubMoney s={s} />
          <AdminAutoDist dist={s.dist} now={s.ruleNow} />
          <AdminSubStars stars={s.stars} />
          <AdminSubBatches batches={s.batches} />
        </>
      )}
    </div>
  );
}
