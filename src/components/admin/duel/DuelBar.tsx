// Панель хода: кто ходит, очередь и последний ход (DuelHud), что можно сделать
// (DuelActions). Бой окончен — итог и что списал бы настоящий бой.
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { alive } from "@/lib/duel/options";
import type { DuelState, OfferKind, Side, SpellId, Unit } from "@/lib/duel/types";
import { DuelActions } from "./DuelActions";
import { DuelHud } from "./DuelHud";
import type { DuelText } from "./duelText";

const btn =
  "inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold disabled:opacity-40";

function Outcome({ st, t, onAgain }: { st: DuelState; t: DuelText; onAgain: () => void }) {
  const lines = (s: Side): string[] => {
    const out: string[] = [];
    const sp = st.spent[s];
    if (sp.energy > 0) out.push(t.spentEnergy(sp.energy));
    if (sp.food.length > 0) out.push(t.spentFood(sp.food));
    const dead = st.units
      .filter((u) => u.side === s && u.kind === "mob" && !alive(u))
      .map((u) => u.name);
    if (dead.length > 0) out.push(t.lostMobs(dead));
    const hero = st.units.find((u) => u.side === s && u.kind === "hero");
    if (st.draw) out.push(t.drawStay);
    else if (st.conceded === s) out.push(t.concededStay);
    else if (st.fled === s) out.push(t.heroFled);
    else if (st.winner !== s) out.push(t.heroHome);
    else if (hero && !alive(hero)) out.push(t.heroHungry);
    return out;
  };
  return (
    <div className="space-y-2 rounded-2xl border border-gold/40 bg-card p-3">
      <p className="text-sm font-bold text-gold">
        {st.draw ? t.draw : st.winner && t.win(st.winner)}
        {st.conceded && st.winner && (
          <span className="font-normal text-muted-foreground"> — {t.enemyConceded}</span>
        )}
      </p>
      <p className="text-[11px] text-muted-foreground">{t.spent}</p>
      {(["a", "b"] as const).map((s) => (
        <p key={s} className="text-[12px]">
          <b>{t.sideName(s)}:</b> {lines(s).join("; ") || "—"}
        </p>
      ))}
      <button
        type="button"
        onClick={onAgain}
        className={cn(btn, "gradient-gold text-gold-foreground")}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t.again}
      </button>
    </div>
  );
}

export function DuelBar(props: {
  st: DuelState;
  unit: Unit | null;
  human: boolean;
  spell: SpellId | null;
  onSpell: (s: SpellId | null) => void;
  onDefend: () => void;
  onEat: (slot: number) => void;
  onFlee: () => void;
  onOffer: (what: OfferKind) => void;
  /** Сколько ходов ждать до следующего предложения (0 — можно). */
  offerLeft: number;
  onAgain: () => void;
  t: DuelText;
}) {
  const { st, unit, t } = props;
  if (st.winner || st.draw) return <Outcome st={st} t={t} onAgain={props.onAgain} />;
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
      <DuelHud st={st} unit={unit} t={t} />
      <DuelActions {...props} />
    </div>
  );
}
