// Охрана СВОЕГО сундука. Охрана по желанию (третья редакция): стоит — видно
// босса и его HP; нет — кнопка «Поставить охрану», пикер общий с шахтой
// (MineGuardPicker → placeMineGuard → chest-guard-place.ts).
import { useState } from "react";
import { ShieldCheck, ShieldPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { thumb } from "@/lib/image";
import { useT, useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { MineGuardPicker } from "@/components/beta-raid/mine/MineGuardPicker";
import { invalidateChests } from "@/components/beta-raid/chest/chestLive";
import type { ChestGuard } from "@/components/beta-raid/chest/chestGuard";

export function ChestGuardBlock({
  q,
  r,
  guard,
}: {
  q: number;
  r: number;
  guard: ChestGuard | null;
}) {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const [picker, setPicker] = useState(false);

  return (
    <div className="border-t border-border/60 pt-2">
      <p className="mb-1 text-center text-[11px] font-semibold text-muted-foreground">
        {t("chest.guard_title")}
      </p>
      {guard ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-1.5">
          {guard.image ? (
            <img
              src={thumb(guard.image, 72, "black")}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover"
            />
          ) : (
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">
              {localizeAssetName(guard.name, lang)}
            </div>
            <div className="text-[10px] font-semibold tabular-nums text-emerald-300">
              {t("mine.guard_on_duty")}
              {!guard.partial && ` · ${Math.round(guard.currentHp)}/${Math.round(guard.maxHp)} HP`}
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPicker(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gold/50 py-2 text-xs font-semibold text-gold"
        >
          <ShieldPlus className="h-4 w-4" /> {t("mine.guard_place")}
        </button>
      )}
      {picker && (
        <MineGuardPicker
          q={q}
          r={r}
          onClose={() => setPicker(false)}
          onPlaced={() => invalidateChests(qc)}
        />
      )}
    </div>
  );
}
