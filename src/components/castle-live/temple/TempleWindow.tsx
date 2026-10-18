// Окно Храма в замке (владелец, 07.10.2026): уровень (до 100), молитва,
// улучшение. Правила — lib/castleTemple.ts, сервер — server/api/castle-temple.ts.
import { useQuery } from "@tanstack/react-query";
import { getCastleTemple } from "@/server/api/castle-temple";
import { TEMPLE_KEY } from "./templeUi";
import { TemplePrayer } from "./TemplePrayer";
import { TempleUpgrade } from "./TempleUpgrade";

export function TempleWindow({ ru }: { ru: boolean }) {
  const q = useQuery({ queryKey: TEMPLE_KEY, queryFn: () => getCastleTemple(), staleTime: 15_000 });
  if (q.isPending) return <p role="status" className="py-8 text-center text-sm">{ru ? "Загрузка…" : "Loading…"}</p>;
  if (q.isError || !q.data) {
    return (
      <div className="py-8 text-center text-sm">
        <p role="alert">{ru ? "Не удалось открыть храм." : "Unable to open the temple."}</p>
        <button type="button" onClick={() => void q.refetch()} className="mt-3 min-h-11 rounded-xl border border-border px-4">
          {ru ? "Повторить" : "Retry"}
        </button>
      </div>
    );
  }
  const t = q.data;
  return (
    <div className="space-y-3">
      <header className="flex items-center gap-2 px-1">
        <span className="font-display text-xl font-bold">{ru ? "Храм" : "Temple"}</span>
        <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-sm font-bold tabular-nums text-gold">
          {t.level}/{t.maxLevel}
        </span>
      </header>
      <TemplePrayer
        ru={ru}
        points={t.points}
        slots={t.slots}
        prayAt={t.prayAt}
        atCastle={t.atCastle}
        extendStars={t.extendStars}
      />
      <TempleUpgrade ru={ru} level={t.level} maxLevel={t.maxLevel} cost={t.cost} resources={t.resources} />
    </div>
  );
}
