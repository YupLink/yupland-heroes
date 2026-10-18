// Мультиселект валют: иконки + поиск + чекбоксы. Управляет набором столбцов
// таблицы Игроков — админ включает/выключает валюты, столбцы появляются и
// пропадают. Строится по тому же шаблону, что и EconomyGoodPicker (закрытие
// по клику мимо и Esc, sticky-поиск).
//
// «Работают по координации независимо» — можно раскрыть несколько строк в
// таблице И одновременно менять список валют: и то, и то состояние живёт
// отдельно у контейнера, пикер только двигает set.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CurrencyIcon } from "./CurrencyIcon";

export type CurrencyDef = { key: string; label: string; image: string | null };

export function EconomyCurrencyPicker({
  currencies,
  selected,
  onChange,
  triggerLabel,
}: {
  currencies: CurrencyDef[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return currencies;
    return currencies.filter(
      (c) => c.label.toLowerCase().includes(s) || c.key.toLowerCase().includes(s),
    );
  }, [currencies, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current) return;
      if (!wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (k: string) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange(next);
  };

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:border-gold/60"
      >
        <span>{triggerLabel ?? "Столбцы"}</span>
        <span className="rounded bg-secondary px-1 text-[10px] tabular-nums text-foreground">
          {selected.size}
        </span>
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 max-h-72 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="sticky top-0 flex items-center gap-2 border-b border-border bg-card px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Найти валюту…"
              className="min-w-0 flex-1 rounded bg-background px-2 py-1 text-[12px] outline-none"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-6 w-6 place-items-center rounded-full border border-border text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="flex items-center justify-between border-b border-border px-2 py-1 text-[10px] text-muted-foreground">
            <span>
              Выбрано: {selected.size} / {currencies.length}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onChange(new Set(currencies.map((c) => c.key)))}
                className="rounded border border-border px-1.5 py-0.5 hover:text-foreground"
              >
                все
              </button>
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="rounded border border-border px-1.5 py-0.5 hover:text-foreground"
              >
                снять
              </button>
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="p-3 text-[11px] text-muted-foreground">Ничего не нашлось.</li>
            ) : (
              filtered.map((c) => {
                const on = selected.has(c.key);
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={cn(
                        "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] transition hover:bg-secondary/40",
                        on && "bg-secondary/50",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded border",
                          on
                            ? "border-gold bg-gold/20 text-gold"
                            : "border-border text-transparent",
                        )}
                      >
                        ✓
                      </span>
                      <div className="shrink-0">
                        <CurrencyIcon currencyKey={c.key} image={c.image} label={c.label} />
                      </div>
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
