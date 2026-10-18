// Пакетная раздача артефактов/героев кошелькам — близнец блока «Раздать бокс»
// на вкладке «Мистик», чтобы админ не переучивался: тот же выбор предмета,
// те же строки «кошелёк + количество», та же вставка списком.
// Разбор вставленного списка общий — @/lib/grantList.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Loader2, Gift, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { humanError } from "@/lib/humanError";
import { clampGrantCount, parseGrantList, type GrantTarget } from "@/lib/grantList";
import { adminGrantItemsBatch } from "@/server/api/items";
import { ItemPickerSelect } from "./ItemPickerSelect";
import type { ItemRow } from "./itemsAdminShared";

type WalletRow = { wallet: string; count: string };
type GrantResult = { wallet: string; count: number; ok: boolean; error?: string };

// Столько кошельков сервер принимает за один запрос (см. items-grant-batch).
// Держим тот же предел на клиенте, иначе вместо понятного текста админ
// получит сырую ошибку валидации.
const MAX_TARGETS = 200;

export function ItemsGrantBatch({ kind, items }: { kind: "artifact" | "hero"; items: ItemRow[] }) {
  const qc = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [rows, setRows] = useState<WalletRow[]>([{ wallet: "", count: "1" }]);
  const [bulk, setBulk] = useState("");
  const [results, setResults] = useState<GrantResult[]>([]);
  const [notified, setNotified] = useState<number | null>(null);
  const noun = kind === "artifact" ? "артефакт" : "героя";
  const unit = kind === "artifact" ? "артефактов" : "героев";
  const active = items.filter((it) => it.active);

  // Вставленный список важнее строк: если админ вставил — считаем по нему.
  const bulkParsed = parseGrantList(bulk);
  const rowsParsed: GrantTarget[] = rows
    .map((r) => ({ wallet: r.wallet.trim(), count: clampGrantCount(r.count) }))
    .filter((r) => r.wallet.length >= 3);
  const jobs = bulkParsed.length > 0 ? bulkParsed : rowsParsed;
  const totalItems = jobs.reduce((s, j) => s + j.count, 0);

  const grant = useMutation({
    mutationFn: () => adminGrantItemsBatch({ data: { templateId, targets: jobs } }),
    onSuccess: (res) => {
      setResults(res.perWallet);
      setNotified(res.notified);
      const failed = res.perWallet.filter((r) => !r.ok);
      const okWallets = res.perWallet.length - failed.length;
      if (failed.length === 0) {
        toast.success(`Выдано: ${okWallets} кош. · ${res.granted} ${unit}`);
        setRows([{ wallet: "", count: "1" }]);
        setBulk("");
      } else {
        toast.error(`Не удалось: ${failed.length}. Выдано: ${okWallets} кош. · ${res.granted} шт.`);
      }
      // Если в списке был свой кошелёк — инвентарь должен обновиться без F5.
      void qc.invalidateQueries({ queryKey: ["my-game-items"], refetchType: "all" });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const tooMany = jobs.length > MAX_TARGETS;
  const canRun = !!templateId && jobs.length > 0 && !tooMany && !grant.isPending;

  function patchRow(i: number, patch: Partial<WalletRow>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-3 rounded-xl border border-gold/25 bg-gold/5 p-3">
      <div className="flex items-center gap-1.5 text-sm font-bold text-gold">
        <Gift className="h-4 w-4" /> Раздать {noun} кошелькам
      </div>

      <ItemPickerSelect
        items={active}
        value={templateId}
        onChange={setTemplateId}
        placeholder={`— выбрать ${noun} —`}
      />

      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={r.wallet}
              onChange={(e) => patchRow(i, { wallet: e.target.value })}
              placeholder="wallet.near"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              max={500}
              value={r.count}
              onChange={(e) => patchRow(i, { count: e.target.value })}
              className="w-20 shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
            <button
              type="button"
              onClick={() =>
                setRows((prev) =>
                  prev.length === 1 ? [{ wallet: "", count: "1" }] : prev.filter((_, j) => j !== i),
                )
              }
              title="Убрать строку"
              className="shrink-0 rounded-lg border border-border bg-secondary/40 px-2 text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { wallet: "", count: "1" }])}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Ещё кошелёк
        </button>
      </div>

      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          Или вставь списком (по строке: <code>wallet,count</code> · через запятую/пробел/таб)
        </div>
        <textarea
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          placeholder={"alice.tg, 2\nbob.near 1\ncarol.tg\t3"}
          rows={4}
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs leading-snug"
        />
        {bulk.trim() && bulkParsed.length === 0 && (
          <div className="mt-1 text-[11px] text-destructive">
            Формат: wallet.near count (в каждой строке)
          </div>
        )}
      </div>

      {jobs.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          К выдаче: <b className="text-foreground">{jobs.length}</b> кошельков ·{" "}
          <b className="text-foreground">{totalItems}</b> {unit}
          {bulkParsed.length > 0 && rowsParsed.length > 0 && (
            <span className="ml-2 text-gold/80">(используется список ниже, не строки выше)</span>
          )}
          {tooMany && (
            <div className="mt-1 text-destructive">
              За один раз — не больше {MAX_TARGETS} кошельков. Раздели список.
            </div>
          )}
        </div>
      )}

      <div className="text-[11px] text-muted-foreground">
        Каждый получатель узнает о подарке — придёт уведомление в Telegram.
      </div>

      <button
        onClick={() => {
          setResults([]);
          setNotified(null);
          grant.mutate();
        }}
        disabled={!canRun}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold/20 py-2 text-sm font-bold text-gold transition active:scale-95 disabled:opacity-40"
      >
        {grant.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Gift className="h-4 w-4" />
        )}
        Начислить
      </button>

      {/* Строка про телеграм нужна, только когда кому-то реально выдали. */}
      {notified !== null && results.some((r) => r.ok) && (
        <div className="rounded-lg border border-border bg-secondary/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          Уведомление в Telegram ушло: <b className="text-foreground">{notified}</b> из{" "}
          {results.filter((r) => r.ok).length}
        </div>
      )}

      {results.length > 0 && (
        <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-background/40 p-2 font-mono text-[11px]">
          {results.map((r, i) => (
            <div
              key={i}
              className={cn(
                "flex justify-between gap-2",
                r.ok ? "text-emerald-300" : "text-rose-400",
              )}
            >
              <span className="truncate">
                {r.ok ? "✓" : "✗"} {r.wallet}
              </span>
              <span className="shrink-0 tabular-nums">
                {r.ok ? `+${r.count}` : (r.error ?? "ошибка").slice(0, 40)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
