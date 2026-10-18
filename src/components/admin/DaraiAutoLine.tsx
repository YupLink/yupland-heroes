// Строка статуса авторассылки над суммой раздачи: включена ли и с какого
// порога. Настраивается на экране «Подписка и авторассылки».
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminAutoDistRules } from "@/server/api/energy-sub/admin";
import { fmt } from "./daraiPayoutShared";

export function DaraiAutoLine() {
  const q = useQuery({ queryKey: ["autodist-rules"], queryFn: () => adminAutoDistRules(), staleTime: 30_000 });
  const r = q.data?.darai_free;
  if (!r) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[12px]">
      <span className="font-semibold">Авторассылка:</span>
      <span className={r.mode === "auto" ? "text-gold" : "text-muted-foreground"}>
        {r.mode === "auto" ? `авто при ≥ ${fmt(r.threshold)} DARAI` : "вручную"}
      </span>
      <Link to="/admin/subscriptions" className="ml-auto text-gold underline">
        настроить
      </Link>
    </div>
  );
}
