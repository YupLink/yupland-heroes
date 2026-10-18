// Выдать подписку игроку: тариф, дни, кошелёк / Telegram ID / @username.
// Сначала «Найти» — показываем, кому именно уйдёт, потом «Выдать».
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift, Loader2, Search } from "lucide-react";
import { humanError } from "@/lib/humanError";
import { newOpId } from "@/lib/opId";
import { adminFindSubTarget, adminGrantSubscription, type SubTarget } from "@/server/api/energy-sub/admin-grant";
import type { SubOffer } from "@/server/api/energy-sub/tiers";
import { ESUB_ADMIN_KEY } from "./AdminSubTiers";

const btn = "inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-50";
const inp = "rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-gold/50";

function who(t: SubTarget): string {
  return [t.username ? `@${t.username}` : null, t.wallets || t.wallet, t.telegramId ? `TG ${t.telegramId}` : null]
    .filter(Boolean)
    .join(" · ");
}

export function AdminSubGrant({ tiers }: { tiers: SubOffer[] }) {
  const qc = useQueryClient();
  const [tierId, setTierId] = useState(tiers[0]?.id ?? "");
  const [days, setDays] = useState(String(tiers[0]?.days ?? 30));
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SubTarget[] | null>(null);
  const [pick, setPick] = useState<SubTarget | null>(null);
  const tier = tiers.find((t) => t.id === tierId);
  const nDays = Math.floor(Number(days));

  const find = useMutation({
    mutationFn: () => adminFindSubTarget({ data: { q } }),
    onSuccess: (rows) => {
      setFound(rows);
      setPick(rows.length === 1 ? rows[0] : null);
      if (rows.length === 0) toast.error("Никого не нашёл — проверь кошелёк, ID или @username");
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const grant = useMutation({
    mutationFn: () =>
      adminGrantSubscription({ data: { tierId, days: nDays, accountId: pick!.accountId, opId: newOpId() } }),
    onSuccess: (r) => {
      toast.success(r.created ? `Подписка выдана, подарков дня 1: ${r.gifts}` : "Такая выдача уже была");
      setFound(null);
      setPick(null);
      setQ("");
      void qc.invalidateQueries({ queryKey: ESUB_ADMIN_KEY });
      // Подписка с лицензией банка (esub-06) — если выдал себе, окно банка увидит её сразу.
      void qc.invalidateQueries({ queryKey: ["bank-license"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-3">
      <h2 className="flex items-center gap-1.5 font-display text-base font-bold">
        <Gift className="h-4 w-4 text-gold" /> Выдать подписку
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {tiers.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTierId(t.id);
              setDays(String(t.days));
            }}
            className={`${btn} ${tierId === t.id ? "border-gold bg-gold/15 text-gold" : ""}`}
          >
            {t.name}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
          дней
          <input className={`${inp} w-16`} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
      </div>
      <div className="flex gap-1.5">
        <input
          className={`${inp} min-w-0 flex-1`}
          placeholder="кошелёк, Telegram ID или @username"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setFound(null);
            setPick(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && q.trim().length >= 2 && find.mutate()}
        />
        <button type="button" className={btn} disabled={q.trim().length < 2 || find.isPending} onClick={() => find.mutate()}>
          {find.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Найти
        </button>
      </div>
      {found && found.length > 0 && (
        <div className="space-y-1">
          {found.map((t) => (
            <button
              key={t.accountId}
              type="button"
              onClick={() => setPick(t)}
              className={`block w-full truncate rounded-lg border px-2 py-1.5 text-left text-[12px] ${
                pick?.accountId === t.accountId ? "border-gold bg-gold/10" : "border-border"
              }`}
            >
              {who(t)}
            </button>
          ))}
        </div>
      )}
      {pick && tier && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 p-2 text-[12px]">
          <span className="min-w-0 flex-1">
            «{tier.name}» на {nDays > 0 ? nDays : "?"} дн. ({tier.energyPerDay.toLocaleString("ru-RU")} энергии
            {tier.boxesPerDay > 0 && tier.boxName ? ` + ${tier.boxesPerDay} × ${tier.boxName}` : ""} в день) →{" "}
            <b>{who(pick)}</b>
          </span>
          <button
            type="button"
            disabled={grant.isPending || !(nDays >= 1 && nDays <= 366)}
            onClick={() => grant.mutate()}
            className="inline-flex items-center gap-1 rounded-lg gradient-gold px-3 py-1.5 font-bold text-gold-foreground disabled:opacity-50"
          >
            {grant.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Выдать
          </button>
        </div>
      )}
    </section>
  );
}
