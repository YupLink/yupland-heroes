// «i» и «Атаковать» над картой — после первого нажатия по боссу/мобу рядом
// (владелец, 23.10.2026): «i» — окно цели (отряд, награды, топ), «Атаковать» —
// удар; повторное нажатие по самой цели тоже бьёт (fightControl). Только в
// полном экране: там карточки «рядом» под картой не видно. Пока удар летит —
// «Атаковать» крутится, чтобы игрок видел, что нажатие услышано.
import { memo } from "react";
import { Info, Loader2, Swords } from "lucide-react";
import { useT } from "@/lib/i18n";
import { attackFight, openFightInfo, useFightInfo } from "./fightInfoBus";

function FightInfoButtonView() {
  const t = useT();
  const { target, busy } = useFightInfo();
  if (!target) return null;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={openFightInfo}
        aria-label={t("braid.target_info")}
        title={t("braid.target_info")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-gold/70 bg-black/85 text-gold shadow-lg transition active:scale-95"
      >
        <Info className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={attackFight}
        disabled={busy}
        className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border-2 border-gold/70 bg-black/85 px-4 text-sm font-bold text-gold shadow-lg transition active:scale-95 disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
        {busy ? t("braid.fighting") : t("braid.attack")}
      </button>
    </div>
  );
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
export const FightInfoButton = memo(FightInfoButtonView);
