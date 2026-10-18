// Правило авторассылки прямо в «Готово к раздаче»: сколько набрано, порог и
// режим — и сохранение. Это та же настройка, что на экране «Подписка и
// авторассылки» (autodist/rules.ts): автомат читает её на каждой проверке
// (раз в 5 минут), так что новый порог работает сразу.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { humanError } from "@/lib/humanError";
import { adminSaveSubDist } from "@/server/api/energy-sub/admin";
import type { DistSettings, RuleKey } from "@/server/api/autodist/rules";
import { Stack, big } from "./moneyShared";

/** «1 000 000 000», «1,5», «100» → число; мусор — NaN. */
const parseNum = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

export function MoneyAutoRule({
  ruleKey,
  label,
  now,
  unit,
  dist,
}: {
  ruleKey: RuleKey;
  label: string;
  now: number;
  unit: string;
  dist: DistSettings;
}) {
  const qc = useQueryClient();
  const saved = dist.rules[ruleKey];
  const [mode, setMode] = useState(saved.mode);
  const [text, setText] = useState(saved.threshold.toLocaleString("ru-RU"));
  // Сохранённое поменялось (здесь или на другом экране) — показываем его.
  useEffect(() => {
    setMode(saved.mode);
    setText(saved.threshold.toLocaleString("ru-RU"));
  }, [saved.mode, saved.threshold]);

  const threshold = parseNum(text);
  const valid = Number.isFinite(threshold) && threshold > 0;
  const dirty = mode !== saved.mode || threshold !== saved.threshold;

  const save = useMutation({
    mutationFn: () =>
      adminSaveSubDist({ data: { dist: { ...dist, rules: { ...dist.rules, [ruleKey]: { mode, threshold } } } } }),
    onSuccess: () => {
      toast.success(`${label}: ${mode === "auto" ? `авто от ${big(threshold)} ${unit}` : "вручную"}`);
      for (const key of [["admin", "money-overview"], ["admin-energy-sub"], ["autodist-rules"]]) {
        void qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-2 text-[13px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 break-words">{label}</span>
        <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
          {big(now)} / {big(saved.threshold)} {unit}
        </span>
      </div>
      <Stack parts={[{ value: now, cls: "bg-gold" }]} total={saved.threshold} />
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode="decimal"
          aria-label={`Порог: ${label}`}
          className={`h-9 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-[13px] tabular-nums ${
            valid ? "border-border" : "border-destructive"
          }`}
        />
        <div className="flex shrink-0 rounded-lg bg-secondary p-0.5">
          {(["auto", "manual"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`h-8 rounded-md px-2.5 text-[12px] font-semibold ${
                mode === m ? "bg-background text-gold" : "text-muted-foreground"
              }`}
            >
              {m === "auto" ? "Авто" : "Вручную"}
            </button>
          ))}
        </div>
      </div>
      {(dirty || !valid) && (
        <div className="flex items-center justify-between gap-3">
          <span className={`text-[12px] tabular-nums ${valid ? "text-muted-foreground" : "text-destructive"}`}>
            {valid ? `= ${big(threshold)} ${unit}` : "порог > 0"}
          </span>
          <button
            type="button"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg gradient-gold px-4 text-[13px] font-bold text-gold-foreground disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Сохранить
          </button>
        </div>
      )}
    </div>
  );
}
