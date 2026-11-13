// Поиск клетки у админа (владелец, 25.10.2026): координаты одной строкой
// («48,-55») — камера едет к клетке, клетка отмечается той же меткой, что у
// «Добычи» и «Экономики» (centerMapBus → drawFlash). Живёт в админской панели
// над картой (AdminRaidRestore) — игроки её не видят.
import { useState } from "react";
import { LocateFixed } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseCellQuery } from "@/lib/raid/parseCellQuery";
import { requestCenter } from "./centerMapBus";

/** Сколько держится метка на найденной клетке: успеть найти её глазами. */
const MARK_MS = 10_000;

export function AdminCellSearch() {
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);

  const go = () => {
    const at = parseCellQuery(text);
    setBad(!at);
    if (at) requestCenter({ ...at, ttlMs: MARK_MS });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="inline-flex items-center gap-1"
    >
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setBad(false);
        }}
        placeholder="q,r"
        aria-label="Координаты клетки"
        autoComplete="off"
        enterKeyHint="go"
        className={cn(
          "h-7 w-24 rounded-lg border bg-background px-2 text-[11px] tabular-nums outline-none transition",
          bad ? "border-destructive" : "border-border focus:border-gold/60",
        )}
      />
      <button
        type="submit"
        title="Показать клетку"
        aria-label="Показать клетку"
        className="inline-flex h-7 items-center rounded-lg border border-border px-2 text-muted-foreground transition hover:text-foreground"
      >
        <LocateFixed className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
