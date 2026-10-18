// История пачек: статус, шаги с хэшами; вставшую — продолжить или закрыть.
// Шаг с неизвестным исходом («отправляется» без ответа сети) не повторяется
// сам: владелец смотрит кошелёк и отмечает «прошёл» / «не прошёл».
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import type { BatchView } from "@/server/api/energy-sub/admin";
import { adminCloseSubBatch, adminResumeSubBatch } from "@/server/api/energy-sub/admin-batches";
import { batchNeedsHands } from "@/lib/energySub";
import type { Step } from "@/server/api/energy-sub/batch-steps";
import { ESUB_ADMIN_KEY } from "./AdminSubTiers";

const STATUS: Record<string, string> = {
  running: "идёт",
  done: "выполнена",
  failed: "встала",
  closed: "закрыта вручную",
};
const btn = "rounded-lg border border-border px-2 py-1 text-[11px] font-semibold disabled:opacity-50";
const STEP: Record<string, string> = { swap: "обмен", map: "пул карты", bank: "откуп золота", burn: "в дупло", dev: "разработчикам" };
const BUCKET: Record<string, string> = {
  sub_usd_map: "Подписки · $ → карта",
  sub_usd: "Подписки · $",
  sub_burn: "Подписки · сжечь DARAI",
  sub_dev: "Подписки · разработчикам DARAI",
  darai_free: "Раздача DARAI (авто)",
  auc_darai: "Аукционы админа · DARAI",
  auc_usd: "Аукционы админа · USDT",
  bank_usd: "Лицензии банка · $ → откуп золота",
};

/** Шаг, последняя запись которого — «отправляется»: исход неизвестен. */
function stuckStep(steps: Step[]): Step["name"] | null {
  const last = new Map<string, Step>();
  for (const s of steps) last.set(s.name, s);
  for (const s of last.values()) if (s.state === "sending" && s.name !== "map") return s.name;
  return null;
}

type Resume = { id: string; stuck?: { name: "swap" | "burn" | "dev"; sent: boolean; hash?: string } };

export function AdminSubBatches({ batches }: { batches: BatchView[] }) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ESUB_ADMIN_KEY });
  const [hash, setHash] = useState("");
  const resume = useMutation({
    mutationFn: (r: Resume) => adminResumeSubBatch({ data: r }),
    onSuccess: () => {
      toast.success("Пачка продолжена");
      done();
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      done();
    },
  });
  const close = useMutation({
    mutationFn: (id: string) =>
      adminCloseSubBatch({ data: { id, note: "проверено вручную" } }),
    onSuccess: () => {
      toast.success("Пачка закрыта");
      done();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  if (batches.length === 0) {
    return <p className="text-[12px] text-muted-foreground">Пачек ещё не было.</p>;
  }
  return (
    <section className="space-y-2">
      <h2 className="font-display text-base font-bold">Пачки</h2>
      {batches.map((b) => (
        <div key={b.id} className="space-y-1 rounded-xl border border-border bg-card p-2.5 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{BUCKET[b.bucket] ?? b.bucket}</span>
            <span className="tabular-nums">
              {b.amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} {b.token}
            </span>
            <span className={batchNeedsHands(b.status, String(b.updatedAt)) ? "font-bold text-destructive" : "text-muted-foreground"}>
              {b.status === "running" && batchNeedsHands(b.status, String(b.updatedAt)) ? "зависла" : (STATUS[b.status] ?? b.status)}
            </span>
            <span className="ml-auto text-muted-foreground">
              {new Date(b.createdAt).toLocaleString("ru-RU")}
            </span>
          </div>
          {(b.steps ?? []).map((s, i) => (
            <div key={i} className="truncate font-mono text-muted-foreground">
              {STEP[s.name] ?? s.name} · {s.state}
              {s.amount != null ? ` · ${s.amount}` : ""}
              {s.received != null ? ` → ${s.received}` : ""}
              {s.hash ? ` · ${s.hash}` : ""}
              {s.hashes?.length ? ` · ${s.hashes.join(", ")}` : ""}
            </div>
          ))}
          {b.error && <div className="text-destructive">{b.error}</div>}
          {batchNeedsHands(b.status, String(b.updatedAt)) && (
            <FailedActions
              b={b}
              hash={hash}
              setHash={setHash}
              busy={resume.isPending || close.isPending}
              onResume={(r) => resume.mutate(r)}
              onClose={() => close.mutate(b.id)}
            />
          )}
        </div>
      ))}
    </section>
  );
}

function FailedActions(p: {
  b: BatchView;
  hash: string;
  setHash: (v: string) => void;
  busy: boolean;
  onResume: (r: Resume) => void;
  onClose: () => void;
}) {
  const auto = p.b.bucket === "darai_free";
  const stuck = auto ? null : stuckStep(p.b.steps ?? []);
  const id = p.b.id;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!stuck && !auto && (
        <button type="button" className={btn} disabled={p.busy} onClick={() => p.onResume({ id })}>
          Продолжить
        </button>
      )}
      {stuck && stuck !== "map" && stuck !== "bank" && (
        <>
          <span className="w-full">Шаг «{STEP[stuck]}»: исход неизвестен — проверь кошелёк.</span>
          {stuck === "swap" && (
            <input
              className="w-64 rounded-lg border border-border bg-background px-2 py-1 font-mono"
              placeholder="хэш транзакции обмена"
              value={p.hash}
              onChange={(e) => p.setHash(e.target.value)}
            />
          )}
          <button
            type="button"
            className={btn}
            disabled={p.busy || (stuck === "swap" && !p.hash.trim())}
            onClick={() => p.onResume({ id, stuck: { name: stuck, sent: true, hash: p.hash.trim() || undefined } })}
          >
            Прошёл — продолжить
          </button>
          <button
            type="button"
            className={btn}
            disabled={p.busy}
            onClick={() => p.onResume({ id, stuck: { name: stuck, sent: false } })}
          >
            Не прошёл — повторить
          </button>
        </>
      )}
      <button type="button" className={btn} disabled={p.busy} onClick={p.onClose}>
        Закрыть вручную
      </button>
    </div>
  );
}
