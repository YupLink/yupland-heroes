// Блок статов фишки с бонусом «Единство: Тираж». Базовые статы (Атака/Жизнь)
// показаны с мелкой красной припиской «×N босс» = во сколько раз стат усилен в
// бою с боссом. Раскрывающийся список показывает ИТОГОВЫЕ значения фишки в бою.
// Один компонент для реальной карточки (ChipDetailModal) и превью — чтобы дизайн
// не расходился. Показывать только когда бонус включён (гейт — у родителя).
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { hpOf, powerOf } from "@/lib/chipStats";
import { tirageBonus, pct, fmtMult } from "@/lib/tirageBonus";

function StatRow({
  label,
  value,
  note,
  gold,
}: {
  label: string;
  value: string;
  note?: string | null;
  gold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        {note && <span className="text-[10px] font-bold text-red-400">{note}</span>}
        <span className={cn("font-mono", gold && "font-semibold text-gold")}>{value}</span>
      </span>
    </div>
  );
}

export function TirageStatBlock({
  level,
  isPremium,
  supply,
  hideSupply = false,
}: {
  level: number;
  isPremium: boolean;
  supply: number | null | undefined;
  hideSupply?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Бонус — от ТИРАЖА коллекции (supply), не от номера фишки.
  const b = tirageBonus(supply ?? null, isPremium);
  const boosted = b.hpPct > 0 || b.atkPct > 0;
  const [lo, hi] = powerOf(level);
  const baseHp = hpOf(level);
  const r = (n: number) => Math.round(n);

  return (
    <div className="space-y-1 text-xs">
      <StatRow
        label={t("chips.kv_attack")}
        value={`${lo}–${hi}`}
        note={boosted && b.atkPct > 0 ? `×${fmtMult(b.atkMult)} босс` : null}
      />
      <StatRow
        label={t("chips.kv_hp")}
        value={baseHp.toLocaleString("ru-RU")}
        note={boosted && b.hpPct > 0 ? `×${fmtMult(b.hpMult)} босс` : null}
      />
      {!hideSupply && (
        <StatRow
          label={t("chips.kv_supply")}
          value={supply != null ? supply.toLocaleString("ru-RU") : "—"}
        />
      )}

      {boosted && (
        <div className="pt-0.5">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center gap-1 py-0.5 text-[11px] font-semibold text-gold"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
            В бою с боссом — итоговые статы
          </button>
          {open && (
            <div className="mt-1 space-y-1 rounded-xl border border-gold/25 bg-gold/5 p-2.5">
              {isPremium && (
                <span className="mb-1 inline-block rounded-full bg-purple-500/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  Премиум
                </span>
              )}
              <StatRow
                label={t("chips.kv_attack")}
                value={`${r(lo * b.atkMult)}–${r(hi * b.atkMult)}`}
                gold
              />
              <StatRow
                label={t("chips.kv_hp")}
                value={r(baseHp * b.hpMult).toLocaleString("ru-RU")}
                gold
              />
              <p className="pt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                Тираж {pct(b.tirageHpPct)}/{pct(b.tirageAtkPct)} HP/ATK
                {b.premium && ` · Премиум ${pct(b.premiumHpPct)}/${pct(b.premiumAtkPct)}`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
