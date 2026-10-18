// Деньги подписки: выключатель витрины, курс, корзины с кнопкой «Распределить сейчас».
// Пороги и режимы авторассылок — AdminAutoDist, звёзды — AdminSubStars.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { humanError } from "@/lib/humanError";
import { adminSetSubsEnabled } from "@/server/api/energy-sub/admin";
import { adminRunSubBatch } from "@/server/api/energy-sub/admin-batches";
import { ESUB_ADMIN_KEY } from "./AdminSubTiers";
import type { Kind } from "@/server/api/energy-sub/batch-kinds";

type State = {
  enabled: boolean;
  rate: { daraiPerUsd: number; ageMs: number } | null;
  buckets: Array<{ bucket: string; balance: number }>;
};

const BUCKET: Record<string, { label: string; unit: string; kind?: Kind }> = {
  sub_usd_map: { label: "$ → карта (меняется сразу)", unit: "USDT", kind: "usd_map" },
  sub_usd: { label: "Корзина $ (вам и дупло)", unit: "USDT", kind: "usd" },
  sub_burn: { label: "Сжечь DARAI", unit: "DARAI", kind: "burn" },
  sub_dev: { label: "Разработчикам DARAI", unit: "DARAI", kind: "dev" },
  sub_stars: { label: "Звёзды подписок", unit: "⭐" },
  auc_darai: { label: "Аукционы админа · DARAI (вам)", unit: "DARAI", kind: "auc_darai" },
  auc_usd: { label: "Аукционы админа · USDT (вам)", unit: "USDT", kind: "auc_usd" },
};
export const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
export const btn = "rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-50";

export function AdminSubMoney({ s }: { s: State }) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ESUB_ADMIN_KEY });
  const onErr = (e: Error) => toast.error(humanError(e));
  const toggle = useMutation({
    mutationFn: () => adminSetSubsEnabled({ data: { enabled: !s.enabled } }),
    onSuccess: () => {
      done();
      void qc.invalidateQueries({ queryKey: ["energy-sub-offers"], refetchType: "all" });
    },
    onError: onErr,
  });
  const run = useMutation({
    mutationFn: (kind: Kind) => adminRunSubBatch({ data: { kind } }),
    onSuccess: (r) => {
      toast.success(r.ids.length ? `Пачек: ${r.ids.length}` : "Нечего рассылать или пачка уже открыта");
      done();
    },
    onError: (e: Error) => {
      onErr(e);
      done();
    },
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-[12px]">
        <span className="font-semibold">{s.enabled ? "Подписка открыта всем" : "Видят только админы"}</span>
        <button type="button" className={btn} onClick={() => toggle.mutate()} disabled={toggle.isPending}>
          {s.enabled ? "Закрыть" : "Открыть всем"}
        </button>
        <span className="ml-auto text-muted-foreground">
          {s.rate
            ? `1 $ = ${fmt(s.rate.daraiPerUsd)} DARAI · обновлён ${Math.round(s.rate.ageMs / 60000)} мин назад`
            : "Курс DARAI недоступен"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {s.buckets.map((b) => {
          const meta = BUCKET[b.bucket] ?? { label: b.bucket, unit: "" };
          const kind = meta.kind;
          return (
            <div key={b.bucket} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-[12px]">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{meta.label}</div>
                <div className="tabular-nums text-muted-foreground">
                  {fmt(b.balance)} {meta.unit}
                </div>
              </div>
              {kind && (
                <button
                  type="button"
                  className={btn}
                  disabled={run.isPending || b.balance <= 0}
                  onClick={() => run.mutate(kind)}
                >
                  {run.isPending ? <Loader2 className="inline h-3 w-3 animate-spin" /> : "Распределить сейчас"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
