// Бонус «Раскопки»: 4 ряда по 5 кучек снизу вверх, в ряду копаешь одну.
// Под кучкой находка (мешочек / сундук / магический сундук) или капкан.
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { BONUS_COLS, BONUS_ROWS, type BonusState } from "@/lib/slot/bonus";
import { MAP_ART } from "@/lib/gameArt";
import { SlotFind } from "./SlotFind";

export function SlotBonusGame({
  bonus,
  stake,
  onPick,
}: {
  bonus: BonusState;
  stake: number;
  onPick: (col: number) => void;
}) {
  const t = useT();
  const active = !bonus.fell && bonus.row < BONUS_ROWS;
  const rows = Array.from({ length: BONUS_ROWS }, (_, i) => BONUS_ROWS - 1 - i);
  const status = active
    ? t("slot.bonus.hint", { n: bonus.row + 1 })
    : bonus.fell
      ? t("slot.bonus.fell")
      : t("slot.bonus.shore");
  const heroRow = bonus.fell ? bonus.row : Math.min(bonus.row, BONUS_ROWS - 1);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between px-1">
        <div>
          <div className="font-display text-lg slot-gold">{t("slot.bonus.title")}</div>
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("slot.bonus.collected")}
          </div>
          <div className="font-display text-2xl font-bold tabular-nums text-gold">{bonus.won}</div>
        </div>
      </div>

      <div className="slot-reels bg-[radial-gradient(ellipse_at_top,#2a1d10,#0c1014_70%)] p-2">
        {rows.map((row) => {
          const current = active && row === bonus.row;
          const revealed = row < bonus.row || (bonus.fell && row === bonus.row);
          return (
            <div
              key={row}
              className={cn("grid grid-cols-5 gap-1 py-0.5", !current && !revealed && "opacity-70")}
            >
              {Array.from({ length: BONUS_COLS }, (_, col) => {
                const value = bonus.board[row][col];
                const picked = bonus.picks[row] === col;
                const open = revealed && picked;
                const hero = picked && row === heroRow && (revealed || bonus.fell);
                return (
                  <button
                    key={col}
                    type="button"
                    disabled={!current}
                    onClick={() => onPick(col)}
                    className={cn(
                      "relative aspect-square rounded-xl transition",
                      current && "hover:scale-105 hover:drop-shadow-[0_0_10px_rgba(245,179,1,0.6)]",
                    )}
                  >
                    <img
                      src={open ? MAP_ART.digHole : MAP_ART.lootMound}
                      alt=""
                      className={cn(
                        "absolute inset-x-0 bottom-0 w-full object-contain",
                        open ? "h-[55%]" : "h-full",
                      )}
                    />
                    {open && <SlotFind mult={value} stake={stake} className="absolute inset-0" />}
                    {hero && !open && (
                      <img
                        src="/slot/bonus.webp"
                        alt=""
                        className="absolute inset-0 m-auto h-[80%] object-contain"
                      />
                    )}
                    {current && (
                      <span className="absolute inset-x-0 bottom-0 mx-auto h-1 w-8 rounded-full bg-gold/80 shadow-[0_0_8px_#f5b301]" />
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
        {bonus.row === 0 && !bonus.fell && (
          <div className="flex justify-center pt-1">
            <img src="/slot/bonus.webp" alt="" className="h-12 object-contain" />
          </div>
        )}
      </div>
    </div>
  );
}
