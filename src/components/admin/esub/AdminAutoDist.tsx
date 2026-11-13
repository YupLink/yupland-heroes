// Авторассылки: у каждого источника — сколько набрано, порог, режим.
// «Авто» — уходит само при пороге (проверка раз в 5 минут); «вручную» — кнопкой.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { adminSaveSubDist } from "@/server/api/energy-sub/admin";
import type { DistSettings, RuleKey } from "@/server/api/autodist/rules";
import { ESUB_ADMIN_KEY } from "./AdminSubTiers";
import { btn, fmt } from "./AdminSubMoney";

const RULES: Array<{ key: RuleKey; label: string; to: string; unit: string }> = [
  { key: "sub_usd", label: "Подписки · корзина $", to: "разработчикам 50 % в USDT · пул сжигания 20 % (обмен); карта 30 % — сразу при покупке", unit: "USDT" },
  { key: "sub_darai", label: "Подписки · DARAI-оплаты", to: "пул сжигания 15 % (в дупло одной транзакцией от 250 млн) · разработчикам 25 %", unit: "DARAI" },
  {
    key: "darai_free",
    label: "Раздача DARAI · «К распределению»",
    to: "дупло 50 % · Ярослав 12,5 % · Миша 12,5 % · держатели legendary 25 %",
    unit: "DARAI",
  },
  { key: "auc_darai", label: "Аукционы админа · DARAI", to: "разработчикам 100 %", unit: "DARAI" },
  { key: "auc_usd", label: "Аукционы админа · USDT", to: "разработчикам 100 %", unit: "USDT" },
];

function Bar({ value, max }: { value: number; max: number }) {
  const w = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className="h-2 w-full rounded-full bg-secondary">
      <div className="h-2 rounded-full bg-gold" style={{ width: `${w}%` }} />
    </div>
  );
}

export function AdminAutoDist({ dist, now }: { dist: DistSettings; now: Record<RuleKey, number | null> }) {
  const qc = useQueryClient();
  const [rules, setRules] = useState(() =>
    Object.fromEntries(
      RULES.map((r) => [r.key, { mode: dist.rules[r.key].mode, threshold: String(dist.rules[r.key].threshold) }]),
    ) as Record<RuleKey, { mode: "auto" | "manual"; threshold: string }>,
  );
  // Сброс правок — только когда сохранённые правила изменились, а не на каждый
  // опрос экрана (иначе набранный порог стирался бы каждые 30 секунд).
  const saved = JSON.stringify(dist.rules);
  useEffect(() => {
    setRules(
      Object.fromEntries(
        RULES.map((r) => [r.key, { mode: dist.rules[r.key].mode, threshold: String(dist.rules[r.key].threshold) }]),
      ) as Record<RuleKey, { mode: "auto" | "manual"; threshold: string }>,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  const save = useMutation({
    mutationFn: () =>
      adminSaveSubDist({
        data: {
          dist: {
            ...dist,
            rules: Object.fromEntries(
              RULES.map((r) => [
                r.key,
                { mode: rules[r.key].mode, threshold: Number(rules[r.key].threshold.replace(/\s/g, "").replace(",", ".")) },
              ]),
            ),
          },
        },
      }),
    onSuccess: () => {
      toast.success("Авторассылки сохранены");
      void qc.invalidateQueries({ queryKey: ESUB_ADMIN_KEY });
      void qc.invalidateQueries({ queryKey: ["autodist-rules"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <section className="space-y-2">
      <h2 className="font-display text-base font-bold">Авторассылки</h2>
      {RULES.map((r) => {
        const v = rules[r.key];
        const cur = now[r.key];
        return (
          <div key={r.key} className="space-y-1.5 rounded-xl border border-border bg-card p-3 text-[12px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {cur == null ? "—" : fmt(cur)} / {fmt(Number(v.threshold) || 0)} {r.unit}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">{r.to}</div>
            <Bar value={cur ?? 0} max={Number(v.threshold) || 0} />
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="w-36 rounded-lg border border-border bg-background px-2 py-1"
                inputMode="decimal"
                value={v.threshold}
                onChange={(e) => setRules({ ...rules, [r.key]: { ...v, threshold: e.target.value } })}
              />
              {(["auto", "manual"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`${btn} ${v.mode === m ? "border-gold text-gold" : ""}`}
                  onClick={() => setRules({ ...rules, [r.key]: { ...v, mode: m } })}
                >
                  {m === "auto" ? "Авто" : "Вручную"}
                </button>
              ))}
              {r.key === "darai_free" && (
                <Link to="/admin/shop" className="text-gold underline">
                  Раздача DARAI
                </Link>
              )}
            </div>
          </div>
        );
      })}
      <button type="button" className={btn} onClick={() => save.mutate()} disabled={save.isPending}>
        Сохранить авторассылки
      </button>
    </section>
  );
}
