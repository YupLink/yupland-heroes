// Казначейская часть раздела «Раздача DARAI»: посмотреть, сколько игроки
// залутали, и залить пул карты обменом USDT → DARAI.
//
// Вынесена отдельно, потому что доступ к ней шире, чем к самой раздаче: пул
// карты наполняет коллекция DARAI, и гонять каждую заливку через владельца —
// лишнее звено. А вот рассылка дохода по долям остаётся только у владельца:
// она двигает чужие деньги.
import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { LootStatsModal } from "./LootStatsModal";
import { DaraiSwapCard } from "./DaraiSwapCard";

export function DaraiTreasuryPanel() {
  const [statsOpen, setStatsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setStatsOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm font-bold text-gold transition hover:bg-gold/20"
      >
        <BarChart3 className="h-4 w-4" />
        Сколько залутали игроки
      </button>
      {statsOpen && <LootStatsModal onClose={() => setStatsOpen(false)} />}

      <DaraiSwapCard />
    </>
  );
}
