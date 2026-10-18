// Риск-игра: карта соперника открыта, четыре закрытых — выбери старше.
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { cardLabel, cardRed, type Card, type RiskState } from "@/lib/slot/risk";

function CardFace({
  card,
  hidden,
  lit,
  dim,
}: {
  card: Card;
  hidden: boolean;
  lit?: "win" | "lose" | "push" | null;
  /** Карта, которую не выбрали: открыта после хода, но приглушена. */
  dim?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex aspect-[2/3] items-center justify-center rounded-xl border font-display text-xl font-bold",
        hidden ? "border-border/60 bg-secondary/60" : "bg-white",
        !hidden && (cardRed(card) ? "text-red-600" : "text-slate-900"),
        lit === "win" && "ring-2 ring-gold",
        lit === "lose" && "ring-2 ring-destructive",
        lit === "push" && "ring-2 ring-neon",
        dim && "opacity-45",
      )}
    >
      {hidden ? <span className="text-muted-foreground">?</span> : cardLabel(card)}
    </div>
  );
}

export function SlotRiskGame({
  risk,
  onPick,
  onTake,
  onClose,
}: {
  risk: RiskState;
  onPick: (i: number) => void;
  onTake: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const picking = risk.picked === null && !risk.done;
  const status =
    risk.outcome === "win"
      ? t("slot.risk.win")
      : risk.outcome === "push"
        ? t("slot.risk.push")
        : risk.outcome === "lose"
          ? t("slot.risk.lose")
          : t("slot.risk.pick");

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="font-display text-lg font-bold">{t("slot.risk.title")}</div>
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">{t("slot.risk.on_stake")}</div>
          <div className="font-display text-xl font-bold tabular-nums text-gold">{risk.stake}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/80 p-3">
        <div className="mb-1 text-center text-[11px] text-muted-foreground">
          {t("slot.risk.dealer")}
        </div>
        <div className="mx-auto w-16">
          <CardFace card={risk.dealer} hidden={false} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {risk.hand.map((c, i) => (
            <button
              key={i}
              type="button"
              disabled={!picking}
              onClick={() => onPick(i)}
              className={cn(picking && "hover:scale-105")}
            >
              {/* После выбора открыты все четыре: выбранная — в рамке, остальные
                  приглушены. До выбора сервер карт не присылает (publicView). */}
              <CardFace
                card={c}
                hidden={risk.picked === null || c.rank === 0}
                lit={risk.picked === i ? risk.outcome : null}
                dim={risk.picked !== null && risk.picked !== i}
              />
            </button>
          ))}
        </div>
      </div>

      {/* «Забрать» — всегда, пока на кону что-то есть; других кнопок нет. После
          выигрыша новая раздача приходит сама через 1,5 с (useSlotGame). */}
      {risk.outcome === "lose" ? (
        <button
          type="button"
          onClick={onClose}
          className="slot-start w-full py-3 text-sm uppercase"
        >
          {t("slot.risk.lost_btn")}
        </button>
      ) : (
        risk.stake > 0 && (
          <button
            type="button"
            onClick={onTake}
            className="slot-start w-full py-3 text-sm uppercase"
          >
            {t("slot.take")} {risk.stake}
          </button>
        )
      )}
    </div>
  );
}
