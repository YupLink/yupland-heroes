// Поиск по жалобе: кошелёк, номер токена или хэш перевода.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { adminNftInputSearch } from "@/server/api/admin-nft-inputs";
import { humanError } from "@/lib/humanError";
import { NftInputCard } from "./NftInputCard";

const KIND_LABEL: Record<string, string> = {
  wallet: "кошелёк",
  token: "номер NFT",
  tx: "хэш перевода",
};

export function NftInputSearchPanel() {
  const [query, setQuery] = useState("");
  const search = useMutation({
    mutationFn: (q: string) => adminNftInputSearch({ data: { query: q } }),
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const res = search.data;

  const run = () => {
    const q = query.trim();
    if (q.length < 2) return;
    search.mutate(q);
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-gold">
        Разбор жалобы
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Кошелёк игрока, номер NFT или хэш перевода — покажем все его вводы: что дошло, что нет.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder="напр. player1.tg, 226228 или AmZFpU…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-gold/50"
        />
        <button
          type="button"
          onClick={run}
          disabled={search.isPending || query.trim().length < 2}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-bold text-background transition hover:bg-gold/90 disabled:opacity-50"
        >
          {search.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Найти
        </button>
      </div>

      {res && (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] text-muted-foreground">
            Ищем как {KIND_LABEL[res.kind]} · найдено операций: {res.rows.length}
            {!res.journal && " · журнала операций в базе ещё нет, показываем по следам выдачи"}
          </div>
          {res.rows.length === 0 && (
            <div className="rounded-xl border border-border/60 bg-secondary/30 p-3 text-xs text-muted-foreground">
              Ни одного перевода на склад не нашлось. Проверь написание кошелька и то, что NFT
              вообще ушла на {"darai_gdrop.near"}.
            </div>
          )}
          {res.rows.map((r) => (
            <NftInputCard
              key={`${r.tokenId}|${r.txHash}`}
              row={r}
              onRecovered={() => search.mutate(res.query)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
