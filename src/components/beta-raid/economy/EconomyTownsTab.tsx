// Города: карточка на ратушу — жители, товары с дневными числами, запасы.
// Подсветка строк товара: зелёный при дефиците (запас < норма),
// красный при переизбытке (запас > норма × 2).
import { cn } from "@/lib/utils";
import type { TownRow } from "@/server/api/beta-raid/admin-economy-types";
import { requestCenter } from "../centerMapBus";
import { fmt } from "./economyFormat";

export function EconomyTownsTab({ towns }: { towns: TownRow[] }) {
  // Панель inline под картой: тап центрирует карту, панель остаётся —
  // админ параллельно следит за жителями и запасами.
  const go = (q: number, r: number) => {
    requestCenter({ q, r, ttlMs: 3000 });
  };

  if (towns.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">Ратуш на карте нет.</div>;
  }

  return (
    <div className="space-y-3 p-3">
      {towns.map((t) => (
        <section key={`${t.q},${t.r}`} className="rounded-2xl border border-border bg-secondary/20">
          <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <button type="button" onClick={() => go(t.q, t.r)} className="text-left">
              <div className="font-display text-sm font-bold text-gold">{t.name}</div>
              <div className="text-[11px] text-muted-foreground">
                Жителей: <b className="text-foreground tabular-nums">{fmt(t.residents)}</b>
              </div>
            </button>
            <button
              type="button"
              onClick={() => go(t.q, t.r)}
              className="rounded-lg border border-border bg-background px-2 py-1 font-mono text-[11px] text-gold transition hover:border-gold/60"
            >
              {t.q},{t.r}
            </button>
          </header>
          {t.goods.length === 0 ? (
            <div className="p-3 text-[11px] text-muted-foreground">Товары города не заданы.</div>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-[10px] uppercase text-muted-foreground">
                  <th className="px-3 py-1.5 text-left font-semibold">Товар</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Потр/сут</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Пр/сут</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Запас</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Норма</th>
                </tr>
              </thead>
              <tbody>
                {t.goods.map((g) => {
                  const short = g.stock < g.norm;
                  const glut = g.stock > g.norm * 2;
                  return (
                    <tr
                      key={g.goodId}
                      className={cn(
                        "border-t border-border/60",
                        short && "bg-emerald-950/30",
                        glut && "bg-red-950/30",
                      )}
                    >
                      <td className="px-3 py-1.5">{g.name}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmt(g.consumePerDay)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {fmt(g.producePerDay)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right tabular-nums font-semibold",
                          short && "text-emerald-300",
                          glut && "text-red-300",
                        )}
                      >
                        {fmt(g.stock)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {fmt(g.norm)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}
