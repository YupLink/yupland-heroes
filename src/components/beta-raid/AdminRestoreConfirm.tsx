// Подтверждение восстановления карты: что именно, сколько и на какие деньги.
//
// Галочки валют здесь же, а не в строке над картой: решение «поднимать ли
// объекты с USDT» принимается ровно в этот момент, глядя на суммы. Снял —
// такие объекты остаются мёртвыми и пул не качают.
//
// Каждый вид разбит по валюте: «Сундуки 100» не отвечало на главный вопрос —
// сколько из этой сотни платят Darai, сколько USDT, а сколько ничего не стоят.
// Группы не пересекаются, поэтому складываются в общее число.
import { Loader2, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  PreviewKind,
  ResourceGroup,
  RestorePreview,
} from "@/server/api/beta-raid/admin-restore-preview";
import { RestoreKindRow } from "./AdminRestoreKindRow";
import { fmtDarai, fmtUsdt } from "./restoreFormat";
import { toBody } from "@/lib/toBody";

export type { RestorePreview };
export type RestorePick = Record<PreviewKind, boolean>;
export type RestoreResources = { darai: boolean; usdt: boolean };

// Подписи спорят с редактором карты: там всё это одна кисть «Сундуки», а здесь
// делится по запасу HP. Уточнение в скобках снимает вопрос «где мой USDT» —
// объекты в один удар (мухоморы) лежат в «Монетках».
const ROWS: Array<{ key: PreviewKind; label: string }> = [
  { key: "boss", label: "Боссы" },
  { key: "chests", label: "Сундуки (с боем)" },
  { key: "coins", label: "Монетки (в один удар)" },
  { key: "artifacts", label: "Артефакты" },
];

/**
 * Что просуммировать по выбранным видам: количество и обе валюты.
 *
 * Ответ берём осторожно: в суточном кэше игрока может лежать ответ ПРОШЛОЙ
 * формы — плоские boss/chests без rows. Версия кэша при смене формы бампится,
 * но окно не должно падать даже на чужом ответе: считаем нули и ждём свежий.
 */
function totals(preview: RestorePreview | undefined, chosen: PreviewKind[]) {
  const acc = { count: 0, darai: 0, usdt: 0 };
  if (!preview?.rows) return acc;
  for (const key of chosen) {
    const row = preview.rows[key];
    if (!row) continue;
    acc.count += row.total;
    for (const g of Object.values(row.groups) as Array<{ darai: number; usdt: number }>) {
      acc.darai += g.darai;
      acc.usdt += g.usdt;
    }
  }
  return acc;
}

function ResourceToggle({
  on,
  label,
  onClick,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-xl border px-2.5 py-2 text-[12px] font-semibold transition",
        on ? "border-gold/50 bg-gold/10 text-gold" : "border-border text-muted-foreground",
      )}
    >
      {on ? "✓ " : ""}
      {label}
    </button>
  );
}

export function AdminRestoreConfirm({
  picked,
  resources,
  onToggleResource,
  preview,
  loading,
  busy,
  onConfirm,
  onClose,
}: {
  picked: RestorePick;
  resources: RestoreResources;
  onToggleResource: (r: keyof RestoreResources) => void;
  preview: RestorePreview | undefined;
  loading: boolean;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const chosen = ROWS.filter((r) => picked[r.key]);
  const sum = totals(
    preview,
    chosen.map((r) => r.key),
  );
  const blocked = preview?.blocked;

  return toBody(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-sm overflow-y-auto rounded-t-3xl border border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:rounded-3xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base font-bold">Восстановить карту?</h3>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <ResourceToggle
            on={resources.darai}
            label="С Darai"
            onClick={() => onToggleResource("darai")}
          />
          <ResourceToggle
            on={resources.usdt}
            label="С USDT"
            onClick={() => onToggleResource("usdt")}
          />
        </div>

        {loading || !preview?.rows ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="divide-y divide-border rounded-xl border border-border">
              {ROWS.map((r) => (
                <RestoreKindRow
                  key={r.key}
                  label={r.label}
                  row={preview.rows?.[r.key]}
                  off={!picked[r.key]}
                />
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-2.5 py-2 text-sm">
              <span className="font-semibold">Всего</span>
              <b className="tabular-nums text-gold">{sum.count}</b>
            </div>
            <div className="flex gap-3 px-0.5 text-[11px] text-muted-foreground">
              <span className="tabular-nums">Дараев: {fmtDarai(sum.darai)}</span>
              <span className="tabular-nums">USDT: {fmtUsdt(sum.usdt)}</span>
              {(preview.skippedUnderPlayers ?? 0) > 0 && (
                <span>под игроками: {preview.skippedUnderPlayers}</span>
              )}
            </div>
            {!!blocked && blocked.count > 0 && (
              <p className="px-0.5 text-[11px] text-muted-foreground">
                Оставим лежать: <b className="text-foreground">{blocked.count}</b>
                {blocked.darai > 0 && <> · {fmtDarai(blocked.darai)} Darai</>}
                {blocked.usdt > 0 && <> · {fmtUsdt(blocked.usdt)} USDT</>}
              </p>
            )}
          </div>
        )}

        <button
          onClick={onConfirm}
          disabled={busy || loading || sum.count === 0}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Восстановить
        </button>
      </div>
    </div>,
  );
}
