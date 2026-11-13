// Блок охраны в окне СВОЕЙ шахты: поставленный охранник (картинка + HP) и
// «Забрать в рюкзак» за энергию по запасу службы шахты (MineGuardTakeButton)
// либо кнопка «Поставить охрану», открывающая пикер боссов из рюкзака.
import { useState } from "react";
import { ShieldPlus, ShieldCheck } from "lucide-react";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { MineGuardPicker } from "./MineGuardPicker";
import { MineGuardTakeButton } from "./MineGuardTakeButton";

type Guardian = {
  name: string;
  image: string | null;
  maxHp: number;
  currentHp: number;
} | null;

export function MineGuardOwnerBlock({
  q,
  r,
  guardian,
  life,
  onChanged,
}: {
  q: number;
  r: number;
  guardian: Guardian;
  /** Запас службы шахты сейчас (0..1); null — не v2. Цена «Забрать охрану». */
  life: number | null;
  onChanged: () => void;
}) {
  const t = useT();
  const [picker, setPicker] = useState(false);

  return (
    <div className="mt-1 border-t border-amber-500/20 pt-2">
      <p className="mb-1 text-center text-[11px] font-semibold text-amber-200/80">
        {t("mine.guard_title")}
      </p>
      {guardian ? (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-1.5">
            {guardian.image ? (
              <img
                src={thumb(guardian.image, 72, "black")}
                alt=""
                className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{guardian.name}</div>
              <div className="text-[10px] font-semibold tabular-nums text-emerald-300">
                {t("mine.guard_on_duty")} · {Math.round(guardian.currentHp)}/
                {Math.round(guardian.maxHp)} HP
              </div>
            </div>
          </div>
          <MineGuardTakeButton q={q} r={r} name={guardian.name} life={life} onTaken={onChanged} />
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setPicker(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-amber-400/50 py-2 text-xs font-semibold text-amber-200"
          >
            <ShieldPlus className="h-4 w-4" /> {t("mine.guard_place")}
          </button>
          <p className="mt-1 text-center text-[10px] leading-tight text-muted-foreground">
            {t("mine.guard_add_hint")}
          </p>
        </>
      )}
      {picker && (
        <MineGuardPicker q={q} r={r} onClose={() => setPicker(false)} onPlaced={onChanged} />
      )}
    </div>
  );
}
