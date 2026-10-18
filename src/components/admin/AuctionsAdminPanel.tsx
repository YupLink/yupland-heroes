// Админка аукционов в дизайне замка: создать/запустить, список, отмена живого
// (все ставки возвращаются). Минимум данных. Вверху — идущие, завершённые и
// отменённые — в свёрнутых «Прошедших». Классы — auction-screen.css.
import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gavel, Loader2, Plus, X } from "lucide-react";
import { adminListAuctions, adminCancelAuction } from "@/server/api/game-auction";
import { timeLeft, KIND_RU, fmtNum, qtyText } from "@/components/chips/auctions/auctionFormat";
import { PrizeInfoLine, RarityChip } from "@/components/chips/auctions/PrizeInfoLine";
import { currencyLabel } from "@/lib/auctionCurrency";
import type { PrizeInfo } from "@/components/chips/auctions/auctionFormat";
import { AuctionCreateForm } from "./AuctionCreateForm";
import { PastSection } from "@/components/chips/auctions/PastSection";
import { ARTPOP_TRIGGER, ArtifactInfoPop } from "@/components/chips/auctions/ArtifactInfoPop";

type Row = {
  id: string;
  prize_kind: string;
  prize_qty: number;
  currency: string;
  end_at: string;
  status: string;
  current: number;
  prize_name: string;
  prize_image: string | null;
  prize_info: PrizeInfo | null;
};

const STATUS_LABEL: Record<string, string> = {
  live: "Идёт",
  settled: "Завершён",
  cancelled: "Отменён",
};

export function AuctionsAdminPanel() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ["admin-auctions"],
    queryFn: () => adminListAuctions(),
    refetchInterval: 20_000,
  });
  const rows = (list.data?.auctions ?? []) as Row[];
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cancel = useMutation({
    mutationFn: (auctionId: string) => adminCancelAuction({ data: { auctionId } }),
    onSuccess: (r) => {
      toast.success(r.ok ? "Отменён" : "Уже не идёт");
      qc.invalidateQueries({ queryKey: ["admin-auctions"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  // Артефакт: нажатие на картинку или название — «что даёт»; повторное — закрыть.
  const [popId, setPopId] = useState<string | null>(null);
  const closePop = useCallback(() => setPopId(null), []);
  const tap = (r: Row) =>
    r.prize_kind === "artifact" && r.prize_info
      ? {
          role: "button" as const,
          tabIndex: 0,
          [ARTPOP_TRIGGER]: r.id,
          onClick: () => setPopId((id) => (id === r.id ? null : r.id)),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setPopId((id) => (id === r.id ? null : r.id));
            }
          },
        }
      : {};
  const isLive = (r: Row) => r.status === "live" && Date.parse(r.end_at) > now;
  const live = rows.filter(isLive);
  const past = rows.filter((r) => !isLive(r));
  const renderRow = (r: Row) => (
    <div key={r.id} className="auction-lot">
      <div className="auction-lot__top">
        <span className="auction-lot__media" {...tap(r)}>
          {r.prize_image ? <img src={r.prize_image} alt="" /> : <Gavel aria-hidden="true" />}
        </span>
        <div className="auction-lot__info" {...tap(r)}>
          <h3 className="auction-lot__title">
            <span className={`auction-chip auction-chip--${r.status}`}>
              {STATUS_LABEL[r.status] ?? r.status}
            </span>{" "}
            <span className="auction-kind">{KIND_RU[r.prize_kind] ?? r.prize_kind}</span>{" "}
            <RarityChip info={r.prize_info} en={false} />
            {r.prize_name}
            {qtyText(Number(r.prize_qty), false)}
          </h3>
          <PrizeInfoLine kind={r.prize_kind} info={r.prize_info} en={false} />
          <p className="auction-lot__meta">
            {fmtNum(Number(r.current), false)} {currencyLabel(r.currency, false)}
            {r.status === "live" ? ` · ${timeLeft(r.end_at, now, false)}` : ""}
          </p>
        </div>
        {isLive(r) && (
          <button
            type="button"
            className="auction-danger"
            disabled={cancel.isPending}
            onClick={() => {
              if (confirm("Отменить аукцион и вернуть ставки?")) cancel.mutate(r.id);
            }}
          >
            Отменить
          </button>
        )}
      </div>
      {popId === r.id && r.prize_info && (
        <ArtifactInfoPop info={r.prize_info} en={false} anchor={r.id} onClose={closePop} />
      )}
    </div>
  );

  return (
    <div>
      <button
        type="button"
        className="auction-primary"
        style={{ width: "100%", marginBottom: 12 }}
        onClick={() => setCreating((v) => !v)}
      >
        {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {creating ? "Свернуть" : "Создать аукцион"}
      </button>

      {creating && (
        <AuctionCreateForm
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["admin-auctions"] });
          }}
        />
      )}

      {list.isLoading ? (
        <div className="auction-loading">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="auction-ledger">
          {live.length === 0 && <p className="auction-empty">Аукционов нет</p>}
          {live.map(renderRow)}
        </div>
      )}
      {past.length > 0 && (
        <PastSection en={false} count={past.length}>
          {() => <div className="auction-ledger">{past.map(renderRow)}</div>}
        </PastSection>
      )}
    </div>
  );
}
