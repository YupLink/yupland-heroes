// «Сделать основным замком?» — у чужого замка или ратуши (useHomeCastle).
import { Loader2 } from "lucide-react";
import type { HomeCastleStatus } from "@/server/api/beta-raid/home-castle";

export function CastleHomeDialog({
  offer,
  ru,
  pending,
  onConfirm,
  onClose,
}: {
  offer: HomeCastleStatus;
  ru: boolean;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const here = offer.here!;
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4" onClick={pending ? undefined : onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-castle-title"
        className="w-full max-w-sm space-y-3 rounded-2xl border border-gold/40 bg-card p-4 text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="home-castle-title" className="font-display text-lg font-bold">
          {ru ? `${here.name} — твой основной замок?` : `Make ${here.name} your main castle?`}
        </h2>
        <p className="text-sm text-muted-foreground">
          {ru
            ? `Сейчас основной замок — ${offer.home.name} (${offer.home.q}, ${offer.home.r}).`
            : `Your current main castle is ${offer.home.name} (${offer.home.q}, ${offer.home.r}).`}
        </p>
        <p className="text-sm font-semibold text-gold">
          {offer.cost > 0
            ? ru
              ? `Переселение — ${offer.cost.toLocaleString("ru-RU")} золота`
              : `Moving costs ${offer.cost.toLocaleString("en-US")} gold`
            : ru
              ? "Первый выбор — бесплатно"
              : "The first choice is free"}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl gradient-gold px-3 text-sm font-bold text-gold-foreground disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {ru ? "Сделать основным" : "Make it main"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="min-h-11 rounded-xl border border-border px-3 text-sm"
          >
            {ru ? "Отмена" : "Cancel"}
          </button>
        </div>
      </section>
    </div>
  );
}
