// YUPLINK · Админ · «Аукцион» (в «Ещё») — массовое выставление NFT на продажу
// на sendler-market.near. Каталог ВСЕХ типов NFT из нашей БД (collection_titles),
// застакан по типу, owned-first + плашка «у меня: N». Токены/деноминации — из
// таблицы reward_tokens. Кол-во лотов на тип; если не хватает своих копий —
// сначала МИНТ копий (как в лавке), потом листинг. On-chain — см. auction.ts.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Store, Loader2, RefreshCw, Search, Check, Tag, X, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NftImage } from "@/components/NftImage";
import {
  adminAuctionCatalog,
  adminAuctionRewardTokens,
  adminBuildAuctionPlan,
  adminExtractMintedTokenIds,
  adminBuildAuctionListActions,
  adminBuildAuctionCreatePlan,
  adminAuctionMarketStorage,
} from "@/server/api/auction";
import { getConnector } from "@/lib/near-connector";

export const Route = createFileRoute("/admin/auction")({
  component: AdminAuction,
});

const OWNERS = ["darai_collection.near", "sendler-alchemy.near"] as const;
const PAGE = 40;
const DURATIONS: Array<{ sec: number; label: string }> = [
  { sec: 3600, label: "1 час" },
  { sec: 21600, label: "6 часов" },
  { sec: 86400, label: "1 день" },
  { sec: 259200, label: "3 дня" },
  { sec: 604800, label: "7 дней" },
  { sec: 2592000, label: "30 дней" },
];

type Row = { title: string; media: string; total: number; owned: number };
type Sel = { qty: number; media: string; owned: number };
type FtToken = { ft_contract: string; symbol: string; decimals: number };
type SignOutcome = { transaction?: { hash?: string } };

/** media из БД/Sendler = голый Arweave TX ID → полный URL (браузер идёт по 302). */
function mediaUrl(m: string): string {
  if (!m) return "";
  if (m.startsWith("http") || m.includes("://") || m.includes("/ipfs/")) return m;
  return `https://arweave.net/${m}`;
}

function AdminAuction() {
  const [owner, setOwner] = useState<(typeof OWNERS)[number]>(
    "darai_collection.near"
  );
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<Map<string, Sel>>(new Map());
  const [amount, setAmount] = useState("");
  const [tokens, setTokens] = useState<FtToken[]>([
    { ft_contract: "near", symbol: "NEAR", decimals: 24 },
  ]);
  const [ft, setFt] = useState("near");
  const [mode, setMode] = useState<"auction" | "sale">("auction");
  const [durationSec, setDurationSec] = useState(86400); // 1 день
  const [minStepPct, setMinStepPct] = useState(5); // шаг ставки, %
  const [listing, setListing] = useState(false);
  const [storage, setStorage] = useState<string | null>("…");

  // Токены-деноминации из нашей таблицы.
  useEffect(() => {
    adminAuctionRewardTokens({ data: {} })
      .then((r) => setTokens(r as FtToken[]))
      .catch(() => {});
  }, []);

  // Дебаунс поиска.
  useEffect(() => {
    const id = setTimeout(() => setApplied(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Закрытие выпадашки по клику вне.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const load = async (refresh: boolean) => {
    setLoading(true);
    try {
      const res = (await adminAuctionCatalog({
        data: { owner, query: applied, offset: 0, limit: PAGE, refresh },
      })) as { items: Row[]; total: number; grandTotal: number };
      setItems(res.items);
      setOffset(res.items.length);
      setTotal(res.total);
      setGrandTotal(res.grandTotal);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, applied]);

  useEffect(() => {
    setStorage("…");
    adminAuctionMarketStorage({ data: { owner } })
      .then((raw) => {
        const r = raw as { ok: boolean; balance?: unknown; error?: string };
        setStorage(
          r.ok
            ? r.balance == null
              ? "НЕТ (нужен storage_deposit)"
              : JSON.stringify(r.balance)
            : `ошибка: ${r.error}`
        );
      })
      .catch(() => setStorage("?"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const res = (await adminAuctionCatalog({
        data: { owner, query: applied, offset, limit: PAGE, refresh: false },
      })) as { items: Row[]; total: number };
      setItems((prev) => prev.concat(res.items));
      setOffset(offset + res.items.length);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (r: Row) =>
    setSelected((prev) => {
      const n = new Map(prev);
      if (n.has(r.title)) n.delete(r.title);
      else n.set(r.title, { qty: 1, media: r.media, owned: r.owned });
      return n;
    });

  const setQty = (title: string, qty: number) =>
    setSelected((prev) => {
      const n = new Map(prev);
      const cur = n.get(title);
      if (cur) n.set(title, { ...cur, qty: Math.max(1, Math.min(200, qty)) });
      return n;
    });

  const totalLots = Array.from(selected.values()).reduce((s, v) => s + v.qty, 0);
  const totalMint = Array.from(selected.values()).reduce(
    (s, v) => s + Math.max(0, v.qty - v.owned),
    0
  );

  const list = async () => {
    if (selected.size === 0) return toast.error("Выбери хотя бы 1 NFT");
    if (amount.trim() === "") return toast.error("Укажи цену");
    setListing(true);
    try {
      const connector = await getConnector();
      if (!connector) throw new Error("NEAR-кошелёк не подключён");
      const conn = await connector.getConnectedWallet();
      const signerAccount = conn.accounts[0]?.accountId ?? "";
      if (!signerAccount) throw new Error("Не удалось определить accountId");
      if (signerAccount !== owner)
        throw new Error(
          `Подпиши кошельком-владельцем ${owner} (сейчас ${signerAccount})`
        );

      const itemsArr = Array.from(selected.entries()).map(([title, v]) => ({
        title,
        qty: v.qty,
      }));

      // Фаза 0 — план: свои token_ids + минт-транзакции на нехватку.
      const plan = (await adminBuildAuctionPlan({
        data: { owner, items: itemsArr, signerAccount },
      })) as {
        ownedTokenIds: string[];
        mintCount: number;
        mintTransactions: Array<{ receiverId: string; actions: unknown[] }>;
      };

      let allIds = plan.ownedTokenIds.slice();

      // Фаза 1 — минт копий (если чего-то не хватает).
      if (plan.mintTransactions.length > 0) {
        toast.message(`Минтим ${plan.mintCount} копий — подпиши…`);
        const out = await conn.wallet.signAndSendTransactions({
          transactions: plan.mintTransactions,
        });
        const outs = (Array.isArray(out) ? out : [out]) as SignOutcome[];
        const hashes = outs
          .map((o) => o?.transaction?.hash)
          .filter((h): h is string => !!h);
        if (hashes.length === 0)
          throw new Error("Минт прошёл, но не получил хэши — выстави позже");
        const ext = (await adminExtractMintedTokenIds({
          data: { txHashes: hashes, signerAccount },
        })) as { tokenIds: string[] };
        if (ext.tokenIds.length < plan.mintCount)
          toast.message(
            `Из ${plan.mintCount} минтов распознал ${ext.tokenIds.length} token_id — выставлю их`
          );
        allIds = allIds.concat(ext.tokenIds);
      }

      if (allIds.length === 0) throw new Error("Нет token_id для выставления");

      if (mode === "auction") {
        // Фаза 2 — таймед-аукционы: penalty-залог (отдельный раунд, должен
        // пройти ДО approve) + nft_approve create_auction по каждому токену.
        const plan = (await adminBuildAuctionCreatePlan({
          data: {
            owner,
            tokenIds: allIds,
            amount: amount.trim(),
            ftContract: ft,
            durationSec,
            minBidStepBps: Math.round(minStepPct * 100),
            signerAccount,
          },
        })) as {
          market: string;
          store: string;
          tokenIds: string[];
          msgBase: Record<string, unknown>;
          durationNs: string;
          approveDeposit: string;
          approveGas: string;
          txGasBudget: number;
          penaltyTopupYocto: string;
          penaltyGas: string;
        };

        // ВАЖНО: залог (penalty-пул на маркете) и create_auction (на сторе) —
        // РАЗДЕЛЬНО. approve-callback create_auction читает пул, поэтому залог
        // должен быть УЖЕ ЗАЧИСЛЕН. Один общий батч гонял их в гонку — залог
        // списывался, а аукционы падали «insufficient penalty» (NEAR уходил в
        // пул, NFT оставались). Теперь: (1) если пул недостаточен — подписываем
        // ТОЛЬКО залог и ждём финализации; (2) затем отдельной подписью —
        // аукционы. Если пул уже полон (topup=0, залог внесён ранее) — шаг 1
        // пропускается, сразу аукционы без оплаты залога.
        type A = {
          type: "FunctionCall";
          params: {
            methodName: string;
            args: Record<string, unknown>;
            gas: string;
            deposit: string;
          };
        };

        // 1) Залог — только если пул не покрывает N аукционов.
        if (plan.penaltyTopupYocto !== "0") {
          toast.message("Шаг 1/2 · залог аукциона (возвратный) — подпиши…");
          await conn.wallet.signAndSendTransactions({
            transactions: [
              {
                receiverId: plan.market,
                actions: [
                  {
                    type: "FunctionCall",
                    params: {
                      methodName: "deposit_auction_penalty",
                      args: {},
                      gas: plan.penaltyGas,
                      deposit: plan.penaltyTopupYocto,
                    },
                  },
                ],
              },
            ] as never,
          });
        }

        // 2) create_auction по токенам (start/end ставим сейчас), пачками по газу.
        const nowNs = BigInt(Date.now()) * 1_000_000n;
        const endNs = nowNs + BigInt(plan.durationNs);
        const approveActions: A[] = plan.tokenIds.map((tid) => ({
          type: "FunctionCall",
          params: {
            methodName: "nft_approve",
            args: {
              token_id: tid,
              account_id: plan.market,
              msg: JSON.stringify({
                ...plan.msgBase,
                start_time: nowNs.toString(),
                end_time: endNs.toString(),
              }),
            },
            gas: plan.approveGas,
            deposit: plan.approveDeposit,
          },
        }));
        // ВАЖНО (on-chain forensics): create_auction НЕЛЬЗЯ паковать по
        // несколько в одну транзу — NEAR исполняет мульти-экшен транзу
        // АТОМАРНО, и один токен без владения/уже-в-аукционе ронял ВСЮ пачку
        // (panic «required to own token»). Поэтому 1 approve = 1 отдельная
        // транза: плохой токен валит только себя, остальные создаются.
        const txs: Array<{ receiverId: string; actions: A[] }> =
          approveActions.map((a) => ({ receiverId: plan.store, actions: [a] }));

        toast.message(
          `${plan.penaltyTopupYocto !== "0" ? "Шаг 2/2 · " : ""}Создаём ${plan.tokenIds.length} аукционов — подпиши…`
        );
        await conn.wallet.signAndSendTransactions({ transactions: txs as never });
        toast.success(`Создано аукционов: ${plan.tokenIds.length}`);
      } else {
        // Фаза 2 — фикс-цена (approve + storage-залог автоматом).
        const build = (await adminBuildAuctionListActions({
          data: {
            owner,
            tokenIds: allIds,
            amount: amount.trim(),
            ftContract: ft,
            chunkSize: 15,
            signerAccount,
          },
        })) as {
          total: number;
          storageTopupYocto: string;
          transactions: unknown[];
        };
        const hasDeposit = build.storageTopupYocto !== "0";
        toast.message(
          `Выставляем ${build.total} лотов${hasDeposit ? " + залог" : ""} — подпиши…`
        );
        await conn.wallet.signAndSendTransactions({
          transactions: build.transactions as never,
        });
        toast.success(`Готово: ${build.total} лотов на продаже`);
      }
      setSelected(new Map());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setListing(false);
    }
  };

  const hasMore = items.length < total;

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20">
          <Store className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight">
            Аукцион
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Выставить NFT на продажу пачкой (минт копий + листинг)
          </p>
        </div>
      </header>

      {/* Кошелёк-владелец + storage */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-3 text-xs">
        <span className="text-muted-foreground">Кошелёк:</span>
        {OWNERS.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOwner(o)}
            className={cn(
              "rounded-lg px-2.5 py-1 font-mono transition",
              owner === o
                ? "bg-gold/15 text-gold ring-1 ring-gold/30"
                : "bg-secondary/40 text-muted-foreground hover:text-foreground"
            )}
          >
            {o}
          </button>
        ))}
        <span className="ml-auto text-muted-foreground">
          storage: <span className="text-foreground">{storage}</span>
        </span>
      </div>

      {/* Поиск с выпадающим каталогом */}
      <div ref={boxRef} className="relative z-40">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            {loading ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(true)}
              placeholder="Поиск NFT по названию…"
              className="w-full rounded-xl border border-border bg-secondary/40 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-gold/50"
            />
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={loading}
            title="Обновить каталог из БД"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-secondary/40 hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-xs text-muted-foreground">
              <span>
                Всего типов: <span className="text-foreground">{total}</span>
                {applied ? ` из ${grandTotal}` : ""}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto rounded-lg bg-secondary/50 px-2 py-0.5 hover:text-foreground"
              >
                Закрыть
              </button>
            </div>
            <div className="max-h-[46vh] overflow-y-auto">
              {items.length === 0 && !loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Пусто. Жми «Обновить».
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {items.map((r) => {
                    const on = selected.has(r.title);
                    return (
                      <li key={r.title}>
                        <button
                          type="button"
                          onClick={() => toggle(r)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left transition",
                            on ? "bg-gold/10" : "hover:bg-secondary/40"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                              on
                                ? "border-gold bg-gold text-gold-foreground"
                                : "border-border"
                            )}
                          >
                            {on && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-black">
                            <NftImage
                              src={mediaUrl(r.media)}
                              className="h-full w-full object-cover"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {r.title || "—"}
                            </span>
                            <span className="block text-[11px] text-muted-foreground">
                              тираж {r.total}
                            </span>
                          </span>
                          {r.owned > 0 && (
                            <span className="shrink-0 rounded-md bg-gold/15 px-1.5 py-0.5 text-[11px] font-semibold text-gold ring-1 ring-gold/30">
                              у меня: {r.owned}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loading}
                  className="w-full py-2.5 text-center text-sm font-medium text-gold hover:bg-secondary/40 disabled:opacity-50"
                >
                  {loading ? "…" : `Показать ещё (${total - items.length})`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Выбранные типы + кол-во лотов */}
      {selected.size > 0 && (
        <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/5 p-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-gold">
              Лотов: {totalLots}
              {totalMint > 0 ? ` · доминтить: ${totalMint}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Map())}
              className="text-muted-foreground hover:text-foreground"
            >
              Снять всё
            </button>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {Array.from(selected.entries()).map(([title, v]) => (
              <div
                key={title}
                className="flex items-center gap-2 rounded-lg bg-secondary/50 px-2 py-1"
              >
                <span className="h-7 w-7 shrink-0 overflow-hidden rounded-md border border-border bg-black">
                  <NftImage src={mediaUrl(v.media)} className="h-full w-full object-cover" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">{title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {v.owned > 0 ? `есть ${v.owned}` : "минт"}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setQty(title, v.qty - 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary hover:bg-secondary/70"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-semibold">
                    {v.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty(title, v.qty + 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary hover:bg-secondary/70"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((prev) => {
                        const n = new Map(prev);
                        n.delete(title);
                        return n;
                      })
                    }
                    className="ml-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Режим + цена + параметры + выставить */}
      <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] space-y-3 rounded-2xl border border-gold/30 bg-card/95 p-4 backdrop-blur-xl">
        <div className="flex gap-1 rounded-xl bg-secondary/40 p-1">
          {(
            [
              ["auction", "Аукцион"],
              ["sale", "Продажа"],
            ] as const
          ).map(([m, l]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-xs font-semibold transition",
                mode === m
                  ? "bg-gold text-gold-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {mode === "auction" ? "Стартовая цена" : "Цена за 1 лот"}
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="напр. 0.5"
              className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Токен
            </label>
            <select
              value={ft}
              onChange={(e) => setFt(e.target.value)}
              className="rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
            >
              {tokens.map((t) => (
                <option key={t.ft_contract} value={t.ft_contract}>
                  {t.symbol}
                </option>
              ))}
            </select>
          </div>
        </div>

        {mode === "auction" && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Длительность
              </label>
              <select
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
              >
                {DURATIONS.map((d) => (
                  <option key={d.sec} value={d.sec}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Шаг ставки %
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={minStepPct}
                onChange={(e) =>
                  setMinStepPct(
                    Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1)))
                  )
                }
                className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-sm outline-none focus:border-gold/50"
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={list}
          disabled={listing || selected.size === 0 || amount.trim() === ""}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition",
            listing || selected.size === 0 || amount.trim() === ""
              ? "border border-border bg-secondary/40 text-muted-foreground"
              : "gradient-gold text-gold-foreground shadow-gold hover:scale-[1.01]"
          )}
        >
          {listing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Tag className="h-4 w-4" />
          )}
          {mode === "auction"
            ? totalMint > 0
              ? `Заминтить ${totalMint} + аукцион ${totalLots}`
              : `Создать ${totalLots} аукцион(ов)`
            : totalMint > 0
              ? `Заминтить ${totalMint} + выставить ${totalLots}`
              : `Выставить ${totalLots} лот(ов)`}
        </button>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {mode === "auction" ? (
            <>
              🔒 Залог <b>1 NEAR/лот</b> (возвратный после продажи) + 0.001
              NEAR/лот. Аукционы создаются по одному токену (пачками). На{" "}
              {totalLots} лот(ов) нужно ~{totalLots} NEAR на кошельке {owner}.
            </>
          ) : (
            <>Депозит ~0.001 NEAR/лот + залог маркета (автомат). Кошелёк {owner}.</>
          )}
          {totalMint > 0 ? " Своих копий не хватает → доминтим." : ""}
        </p>
      </div>
    </div>
  );
}
