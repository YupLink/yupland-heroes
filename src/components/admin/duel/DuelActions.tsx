// Что может сделать ваш боец: заклинания героя карточками (значок, имя, цена в
// энергии, что даёт), еда героя (картинка и сколько сытости вернёт), «Оборона» и
// «Сбежать». Владелец 09.11.2026: «мои умения выглядят не очень и непонятно».
// Кнопки стоят всегда и только гаснут не в свой ход — панель не прыгает.
import { Award, BrickWall, Flag, Handshake, Shield, Swords, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { spellCost } from "@/lib/duel/rules";
import type { DuelState, OfferKind, SpellId, Unit } from "@/lib/duel/types";
import { SPELL_COLOR } from "./canvas/marks";
import { short, type DuelText } from "./duelText";

const SPELL_ICON: Record<SpellId, typeof Shield> = { atk: Swords, def: Shield };

const card =
  "flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition disabled:opacity-40";
const off = "border-border bg-secondary/30 hover:bg-secondary/60";

export function DuelActions({
  st,
  unit,
  human,
  spell,
  onSpell,
  onDefend,
  onEat,
  onFlee,
  onOffer,
  offerLeft,
  t,
}: {
  st: DuelState;
  unit: Unit | null;
  human: boolean;
  spell: SpellId | null;
  onSpell: (s: SpellId | null) => void;
  onDefend: () => void;
  onEat: (slot: number) => void;
  onFlee: () => void;
  onOffer: (what: OfferKind) => void;
  offerLeft: number;
  t: DuelText;
}) {
  const kit = st.kits.a;
  const heroTurn = human && unit?.kind === "hero";
  const full = !!unit && unit.hp >= unit.maxHp;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{t.spells}</span>
        {!heroTurn && <span>{t.heroOnly}</span>}
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {(["atk", "def"] as const).map((s) => {
          const Icon = SPELL_ICON[s];
          const cost = spellCost(s, kit.int);
          const on = spell === s;
          return (
            <button
              key={s}
              type="button"
              disabled={!heroTurn || kit.energy < cost}
              onClick={() => onSpell(on ? null : s)}
              className={cn(card, on ? "border-gold bg-gold/15" : off)}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/40"
                style={{ color: SPELL_COLOR[s] }}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[12px] font-bold">
                  {t.spell[s]}
                  <span className="inline-flex shrink-0 items-center whitespace-nowrap text-[11px] font-semibold text-gold">
                    <Zap className="h-3 w-3" />
                    {cost}
                  </span>
                </span>
                <span className="block truncate text-[10.5px] text-muted-foreground">
                  {t.spellHint[s]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {spell && <p className="text-[11.5px] font-semibold text-gold">{t.pickAlly}</p>}
      {kit.food.some(Boolean) && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">{t.food}</p>
          <div className="flex flex-wrap gap-1.5">
            {kit.food.map((f, i) =>
              f ? (
                <button
                  key={i}
                  type="button"
                  title={f.name}
                  disabled={!heroTurn || full}
                  onClick={() => onEat(i)}
                  className={cn(card, off, "flex-none")}
                >
                  {f.image && (
                    <img src={thumb(f.image, 48)} alt="" className="h-7 w-7 object-contain" />
                  )}
                  <span className="text-[12px] font-bold text-emerald-400">+{short(f.value)}</span>
                </button>
              ) : null,
            )}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <button type="button" disabled={!human} onClick={onDefend} className={cn(card, off)}>
          <BrickWall className="h-4.5 w-4.5 shrink-0 text-sky-400" />
          <span className="min-w-0">
            <span className="block text-[12px] font-bold">{t.defend}</span>
            <span className="block truncate text-[10.5px] text-muted-foreground">
              {t.defendHint}
            </span>
          </span>
        </button>
        {(["draw", "surrender"] as const).map((what) => (
          <button
            key={what}
            type="button"
            disabled={!human || offerLeft > 0}
            onClick={() => onOffer(what)}
            className={cn(card, off)}
          >
            {what === "draw" ? (
              <Handshake className="h-4.5 w-4.5 shrink-0 text-amber-300" />
            ) : (
              <Award className="h-4.5 w-4.5 shrink-0 text-gold" />
            )}
            <span className="min-w-0">
              <span className="block text-[12px] font-bold">
                {what === "draw" ? t.offerDraw : t.offerWin}
              </span>
              {offerLeft > 0 && (
                <span className="block text-[10.5px] text-muted-foreground">
                  {t.inMoves(offerLeft)}
                </span>
              )}
            </span>
          </button>
        ))}
        <button
          type="button"
          disabled={!human}
          onClick={onFlee}
          className={cn(card, "border-destructive/50 text-destructive hover:bg-destructive/10")}
        >
          <Flag className="h-4 w-4 shrink-0" />
          <span className="text-[12px] font-bold">{t.flee}</span>
        </button>
      </div>
    </div>
  );
}
