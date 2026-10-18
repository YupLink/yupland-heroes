import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Upload,
  Wallet,
  Send,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Image as ImageIcon,
  X,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseNftCsv, allocate, type ParsedNftCsv } from "@/lib/nftBatchCsv";
import { listLocalWallets, hasPin, sendNftJobsBatch } from "@/lib/embeddedWallet";
import {
  adminFindNftsByTitles,
  adminBuildNftMintActions,
} from "@/server/api/wallet";
import { Hammer } from "lucide-react";
import { humanError } from "@/lib/humanError";

interface Job {
  id: number;
  fileName: string;
  title: string;
  parsed: ParsedNftCsv;
}
interface JobResult {
  sent: number;
  txHashes: string[];
  error?: string;
  failed: Array<{ tokenId: string; recipient: string }>;
}

export function NftCsvBatchSender() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sender, setSender] = useState("");
  const [pin, setPin] = useState("");
  const [pinNeeded, setPinNeeded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [progressByJob, setProgressByJob] = useState<
    Record<number, { sent: number; total: number }>
  >({});
  const [results, setResults] = useState<Record<number, JobResult>>({});
  const [mintEnabled, setMintEnabled] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(1);

  const wallets = useQuery({
    queryKey: ["local-wallets"],
    queryFn: () => listLocalWallets(),
  });

  useEffect(() => {
    if (!sender && wallets.data && wallets.data.length === 1)
      setSender(wallets.data[0]);
  }, [wallets.data, sender]);

  useEffect(() => {
    if (!sender) return setPinNeeded(false);
    hasPin(sender)
      .then(setPinNeeded)
      .catch(() => setPinNeeded(false));
  }, [sender]);

  const titles = useMemo(
    () => [...new Set(jobs.map((j) => j.title).filter(Boolean))],
    [jobs]
  );

  // Живой поиск по всем тайтлам через Sendler.
  const lookup = useQuery({
    queryKey: ["nft-by-titles", sender, titles],
    queryFn: () =>
      adminFindNftsByTitles({
        data: { ownerWallet: sender || undefined, titles },
      }),
    enabled: titles.length > 0,
    staleTime: 15_000,
  });

  async function onFiles(files: FileList) {
    const added: Job[] = [];
    for (const f of Array.from(files)) {
      const text = await f.text();
      const parsed = parseNftCsv(f.name, text);
      added.push({
        id: idRef.current++,
        fileName: f.name,
        title: parsed.title,
        parsed,
      });
    }
    setJobs((prev) => [...prev, ...added]);
    setResults({});
    setConfirming(false);
  }

  function jobInfo(job: Job) {
    const res = lookup.data?.[job.title];
    const need = job.parsed.totalCount;
    const available = res?.count ?? 0;
    const hasMeta = (res?.totalForTitle ?? 0) > 0; // есть образец для метаданных
    // доминт недостающих: если включён и есть образец метаданных
    const toMint = mintEnabled && hasMeta ? Math.max(0, need - available) : 0;
    const willTransfer = Math.min(available, need);
    const enough = willTransfer + toMint >= need && need > 0;
    return { res, need, available, hasMeta, toMint, willTransfer, enough };
  }

  const readyJobs = jobs.filter((j) => jobInfo(j).enough);
  const totalToSend = readyJobs.reduce((s, j) => s + j.parsed.totalCount, 0);
  const totalToMint = readyJobs.reduce((s, j) => s + jobInfo(j).toMint, 0);
  const allDone = jobs.length > 0 && jobs.every((j) => results[j.id]);

  // Общий прогон: шлёт переданные задания одной непрерывной nonce-серией.
  async function runBatch(
    batchJobs: Array<{
      key: string;
      nftContract: string;
      transfers: Array<{ tokenId: string; recipient: string }>;
    }>
  ) {
    return sendNftJobsBatch({
      accountId: sender,
      pin: pin || undefined,
      jobs: batchJobs,
      onProgress: (ev) => {
        const id = Number(ev.jobKey);
        setProgressByJob((prev) => ({
          ...prev,
          [id]: {
            sent: (prev[id]?.sent ?? 0) + ev.okTransfers,
            total: prev[id]?.total ?? 0,
          },
        }));
      },
    });
  }

  const send = useMutation({
    mutationFn: async () => {
      if (!sender) throw new Error("Выбери кошелёк-отправитель");
      if (readyJobs.length === 0)
        throw new Error("Нет готовых заданий (не хватает NFT)");
      if (pinNeeded && !pin) throw new Error("Введи PIN кошелька");

      const init: Record<number, { sent: number; total: number }> = {};
      for (const job of readyJobs)
        init[job.id] = { sent: 0, total: job.parsed.totalCount };
      setProgressByJob(init);

      // Аллокация: имеющиеся → перевод, дефицит → минт (если включён). Минт-actions
      // строит сервер из Sendler-метаданных.
      const batchJobs: Array<{
        key: string;
        nftContract: string;
        transfers: Array<{ tokenId: string; recipient: string }>;
        mints?: Awaited<
          ReturnType<typeof adminBuildNftMintActions>
        >["actions"];
      }> = [];
      for (const job of readyJobs) {
        const { res } = jobInfo(job);
        const { transfers, mints } = allocate(
          job.parsed.recipients,
          res!.tokenIds
        );
        let mintActions:
          | Awaited<ReturnType<typeof adminBuildNftMintActions>>["actions"]
          | undefined;
        if (mintEnabled && mints.length > 0) {
          const built = await adminBuildNftMintActions({
            data: { title: job.title, signerWallet: sender, mints },
          });
          mintActions = built.actions;
        }
        batchJobs.push({
          key: String(job.id),
          nftContract: res!.contractId as string,
          transfers,
          mints: mintActions,
        });
      }
      const out = await runBatch(batchJobs);

      const fin: Record<number, JobResult> = {};
      for (const job of jobs) {
        const o = out[String(job.id)];
        if (!o) {
          const { available, need } = jobInfo(job);
          fin[job.id] = {
            sent: 0,
            txHashes: [],
            failed: [],
            error: `Пропущено: доступно ${available} из ${need}`,
          };
        } else {
          fin[job.id] = {
            sent: o.sent,
            txHashes: o.txHashes,
            failed: o.failed,
            error: o.errors.length
              ? o.errors[o.errors.length - 1].slice(0, 180)
              : undefined,
          };
        }
      }
      setResults(fin);
      return out;
    },
    onSuccess: (out) => {
      setConfirming(false);
      const okSent = Object.values(out).reduce((s, x) => s + x.sent, 0);
      const failed = Object.values(out).reduce((s, x) => s + x.failed.length, 0);
      if (failed)
        toast.warning(
          `Отправлено ${okSent} NFT, не ушло ${failed} — нажми «Повторить ошибки»`
        );
      else toast.success(`Отправлено ${okSent} NFT 🎉`);
      lookup.refetch();
    },
    onError: (e: Error) => {
      setConfirming(false);
      toast.error(humanError(e));
    },
  });

  // Повтор только упавших переводов (без двойной отправки — упавший токен всё
  // ещё на отправителе).
  const retry = useMutation({
    mutationFn: async () => {
      if (pinNeeded && !pin) throw new Error("Введи PIN кошелька");
      const batchJobs = jobs
        .map((job) => ({ job, failed: results[job.id]?.failed ?? [] }))
        .filter((x) => x.failed.length > 0)
        .map((x) => ({
          key: String(x.job.id),
          nftContract: jobInfo(x.job).res?.contractId ?? "",
          transfers: x.failed,
        }))
        .filter((b) => b.nftContract);
      if (batchJobs.length === 0)
        throw new Error("Нет упавших переводов для повтора");

      // прогресс продолжаем с уже отправленного
      setProgressByJob((prev) => {
        const next = { ...prev };
        for (const b of batchJobs) {
          const id = Number(b.key);
          const already = results[id]?.sent ?? 0;
          next[id] = { sent: already, total: already + b.transfers.length };
        }
        return next;
      });

      const out = await runBatch(batchJobs);

      setResults((prev) => {
        const next = { ...prev };
        for (const b of batchJobs) {
          const id = Number(b.key);
          const o = out[b.key];
          const old = prev[id];
          if (o && old) {
            next[id] = {
              sent: old.sent + o.sent,
              txHashes: [...old.txHashes, ...o.txHashes],
              failed: o.failed,
              error: o.errors.length
                ? o.errors[o.errors.length - 1].slice(0, 180)
                : undefined,
            };
          }
        }
        return next;
      });
      return out;
    },
    onSuccess: (out) => {
      const okSent = Object.values(out).reduce((s, x) => s + x.sent, 0);
      const failed = Object.values(out).reduce((s, x) => s + x.failed.length, 0);
      if (failed) toast.warning(`Повтор: ушло ещё ${okSent}, осталось ${failed}`);
      else toast.success(`Повтор завершён, ушло ещё ${okSent} 🎉`);
      lookup.refetch();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const busy = send.isPending || retry.isPending;
  const failedTotal = jobs.reduce(
    (s, j) => s + (results[j.id]?.failed.length ?? 0),
    0
  );

  return (
    <div className="space-y-4">
      {/* Дроп-зона (несколько файлов) */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 bg-card/40 px-4 py-7 text-center transition hover:border-gold/50 hover:bg-card/70 disabled:opacity-50"
      >
        <Upload className="h-6 w-6 text-gold" />
        <div className="text-sm font-medium">
          {jobs.length ? "Добавить ещё CSV" : "Загрузить CSV (можно несколько)"}
        </div>
        <div className="text-xs text-muted-foreground">
          Каждый файл = свой NFT. Тайтл из имени файла, получатели из содержимого
        </div>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {jobs.length > 0 && (
        <>
          {/* Кошелёк-отправитель (общий) */}
          <div className="rounded-xl border border-border/50 bg-card/60 p-4">
            <label className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Wallet className="h-3 w-3" /> Кошелёк-отправитель (общий для всех)
            </label>
            {wallets.data && wallets.data.length > 0 ? (
              <select
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                disabled={busy}
                className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-gold/50 disabled:opacity-50"
              >
                <option value="">— выбери кошелёк —</option>
                {wallets.data.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                Нет локальных кошельков. Импортируй кошелёк-владелец этих NFT в
                «Мой кошелёк».
              </div>
            )}
            {pinNeeded && (
              <input
                type="password"
                inputMode="numeric"
                placeholder="PIN кошелька"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                disabled={busy}
                className="mt-2 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-gold/50 disabled:opacity-50"
              />
            )}
            {/* Доминт недостающих */}
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/50 bg-background/50 px-3 py-2">
              <input
                type="checkbox"
                checked={mintEnabled}
                onChange={(e) => setMintEnabled(e.target.checked)}
                disabled={busy}
                className="mt-0.5 h-4 w-4 accent-gold"
              />
              <span className="text-xs">
                <span className="flex items-center gap-1 font-medium">
                  <Hammer className="h-3 w-3 text-gold" /> Доминтить недостающие
                </span>
                <span className="text-muted-foreground">
                  Если на кошельке не хватает — доминтить дефицит прямо получателям
                  (метаданные из Sendler, ~0.0099 NEAR за NFT). Кошелёк должен быть
                  минтером контракта.
                </span>
              </span>
            </label>
          </div>

          {/* Задания (по файлу) */}
          {jobs.map((job) => {
            const { res, need, available, enough, toMint } = jobInfo(job);
            const result = results[job.id];
            const prog = progressByJob[job.id];
            const isRunning = busy && !result && !!prog;
            return (
              <div
                key={job.id}
                className="space-y-3 rounded-xl border border-border/50 bg-card/60 p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
                    {res?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={res.image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <input
                      value={job.title}
                      onChange={(e) =>
                        setJobs((prev) =>
                          prev.map((j) =>
                            j.id === job.id ? { ...j, title: e.target.value } : j
                          )
                        )
                      }
                      disabled={busy}
                      className="w-full bg-transparent text-sm font-semibold outline-none disabled:opacity-60"
                    />
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {job.fileName} · {job.parsed.recipients.length} получателей ·
                      нужно{" "}
                      <span className="font-medium text-foreground">{need}</span>
                    </div>
                  </div>
                  {!busy && !result && (
                    <button
                      onClick={() => {
                        setJobs((prev) => prev.filter((j) => j.id !== job.id));
                      }}
                      className="text-muted-foreground/60 transition hover:text-red-500"
                      title="Убрать"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Статус: результат (с частичными ошибками) | прогресс | наличие */}
                {result ? (
                  <div className="space-y-1.5">
                    {result.sent > 0 && (
                      <div className="space-y-1.5 rounded-lg bg-emerald-500/10 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Отправлено {result.sent} в {result.txHashes.length} tx
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {result.txHashes.map((h) => (
                            <a
                              key={h}
                              href={`https://nearblocks.io/txns/${h}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              {h.slice(0, 6)}…{" "}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {(result.failed.length > 0 ||
                      (result.error && result.sent === 0)) && (
                      <div className="flex items-start gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                          {result.error ?? `${result.failed.length} NFT не ушло`}
                        </span>
                      </div>
                    )}
                  </div>
                ) : isRunning ? (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Отправка…</span>
                      <span>
                        {prog.sent}/{prog.total}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-gold transition-all"
                        style={{
                          width: `${prog.total ? (prog.sent / prog.total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs",
                      lookup.isFetching
                        ? "bg-secondary text-muted-foreground"
                        : enough
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-red-500/10 text-red-600 dark:text-red-400"
                    )}
                  >
                    {lookup.isFetching ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : enough ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    {lookup.isFetching
                      ? "Ищу через Sendler…"
                      : !sender
                        ? `Всего по тайтлу: ${res?.totalForTitle ?? 0}`
                        : toMint > 0
                          ? `Переведём ${available}, доминтим ${toMint} → ${need}`
                          : `Доступно ${available} из ${need} на ${sender}`}
                  </div>
                )}

                {/* Где лежат (если не на отправителе) */}
                {!result &&
                  !lookup.isFetching &&
                  !enough &&
                  (res?.holders.length ?? 0) > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>Лежат на:</span>
                      {res!.holders.slice(0, 6).map((h) => {
                        const isLocal = wallets.data?.includes(h.wallet);
                        return isLocal ? (
                          <button
                            key={h.wallet}
                            onClick={() => setSender(h.wallet)}
                            disabled={busy}
                            className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] hover:text-foreground"
                          >
                            {h.wallet}: {h.count}
                          </button>
                        ) : (
                          <span
                            key={h.wallet}
                            className="rounded bg-secondary/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70"
                          >
                            {h.wallet}: {h.count} · импортируй
                          </span>
                        );
                      })}
                      {res!.holders.length > 6 && (
                        <span className="text-muted-foreground/60">
                          +{res!.holders.length - 6} ещё
                        </span>
                      )}
                    </div>
                  )}
              </div>
            );
          })}

          {/* Итог + кнопка */}
          {!allDone && (
            <div className="rounded-xl border border-border/50 bg-card/40 p-4">
              <div className="mb-2 text-sm text-muted-foreground">
                Готово к отправке:{" "}
                <span className="font-medium text-foreground">
                  {readyJobs.length}
                </span>{" "}
                из {jobs.length} заданий ·{" "}
                <span className="font-medium text-foreground">
                  {totalToSend}
                </span>{" "}
                NFT
                {totalToMint > 0 && (
                  <span className="text-gold">
                    {" "}
                    (доминт {totalToMint})
                  </span>
                )}
              </div>
              {confirming ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => send.mutate()}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Точно отправить {totalToSend} NFT ({readyJobs.length} заданий)
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={busy}
                    className="flex items-center justify-center rounded-lg border border-border/60 px-3 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  disabled={readyJobs.length === 0 || !sender || busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-gold/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                  Отправить всё ({totalToSend} NFT)
                </button>
              )}
            </div>
          )}

          {allDone && (
            <div className="space-y-2">
              {failedTotal > 0 && (
                <button
                  onClick={() => retry.mutate()}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-600 disabled:opacity-50"
                >
                  {retry.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                  Повторить ошибки ({failedTotal} NFT)
                </button>
              )}
              <button
                onClick={() => {
                  setJobs([]);
                  setResults({});
                  setProgressByJob({});
                }}
                disabled={busy}
                className="w-full rounded-lg border border-border/60 px-4 py-2.5 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              >
                Очистить и начать заново
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
