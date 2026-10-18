// Игроки: настоящая таблица со столбцами по выбранным валютам. Не «навалом
// иконок в строке», а фиксированная сетка — цифры выравниваются по столбику.
//
// Управление столбцами — мультиселект-пикер с иконками и поиском (как в
// Дёшево/Дорого). По умолчанию — 6 базовых валют; админ может добавить
// любое количество, снять все, или включить всё разом. Сортировка кликом
// по заголовку столбца или по «Активность»/«Имя». Раскрытие строки
// показывает карточки со ВСЕМИ балансами: столбцы — для сравнения игроков,
// карточки — для «глянуть всё у одного».
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { PlayerRow } from "@/server/api/beta-raid/admin-economy-types";
import { EconomyCurrencyPicker, type CurrencyDef } from "./EconomyCurrencyPicker";
import type { CurrencyMeta } from "./EconomyPlayerParts";
import { EconomyPlayersTable, type PlayerSort } from "./EconomyPlayersTable";

const DEFAULT_COLUMNS = ["likes", "tickets", "gold", "stone", "wood", "diamonds"];

function balOf(p: PlayerRow, key: string): number {
  return p.balances.find((b) => b.currency === key)?.amount ?? 0;
}

export function EconomyPlayersTab({
  players,
  currencies,
}: {
  players: PlayerRow[];
  currencies: CurrencyDef[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<PlayerSort>({ kind: "active", desc: true });
  const [search, setSearch] = useState("");
  // Начальный набор — 6 валют, из тех что реально есть у игроков.
  const [cols, setCols] = useState<Set<string>>(() => {
    const have = new Set(currencies.map((c) => c.key));
    const s = new Set<string>();
    for (const k of DEFAULT_COLUMNS) if (have.has(k)) s.add(k);
    if (s.size === 0) currencies.slice(0, 5).forEach((c) => s.add(c.key));
    return s;
  });

  const shownCols = useMemo(() => currencies.filter((c) => cols.has(c.key)), [currencies, cols]);
  const currencyMap = useMemo(() => {
    const m = new Map<string, CurrencyMeta>();
    for (const c of currencies) m.set(c.key, { label: c.label, image: c.image });
    return m;
  }, [currencies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.accountId.toLowerCase().includes(q) ||
        (p.telegramUsername ?? "").toLowerCase().includes(q),
    );
  }, [players, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      if (sort.kind === "name") {
        return sort.desc
          ? b.displayName.localeCompare(a.displayName)
          : a.displayName.localeCompare(b.displayName);
      }
      if (sort.kind === "active") {
        const ta = a.lastActive ? Date.parse(a.lastActive) : 0;
        const tb = b.lastActive ? Date.parse(b.lastActive) : 0;
        return sort.desc ? tb - ta : ta - tb;
      }
      const av = balOf(a, sort.key);
      const bv = balOf(b, sort.key);
      return sort.desc ? bv - av : av - bv;
    });
    return list;
  }, [filtered, sort]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const flipName = () =>
    setSort((s) =>
      s.kind === "name" ? { kind: "name", desc: !s.desc } : { kind: "name", desc: false },
    );
  const flipActive = () =>
    setSort((s) =>
      s.kind === "active" ? { kind: "active", desc: !s.desc } : { kind: "active", desc: true },
    );
  const flipCurrency = (k: string) =>
    setSort((s) =>
      s.kind === "currency" && s.key === k
        ? { kind: "currency", key: k, desc: !s.desc }
        : { kind: "currency", key: k, desc: true },
    );

  if (players.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">Игроков в базе не нашли.</div>;
  }

  return (
    <div>
      {/* Высота 48px — жёстко: заголовок таблицы под ней использует top-[48px]
          для sticky-заголовка. Меняешь одно — меняй и второе. */}
      <div className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Найти игрока…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-gold/60"
        />
        <EconomyCurrencyPicker
          currencies={currencies}
          selected={cols}
          onChange={setCols}
          triggerLabel="Столбцы"
        />
        <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:block">
          {sorted.length} / {players.length}
        </span>
      </div>

      <EconomyPlayersTable
        rows={sorted}
        cols={shownCols}
        currencyMap={currencyMap}
        sort={sort}
        onFlipName={flipName}
        onFlipActive={flipActive}
        onFlipCurrency={flipCurrency}
        expanded={expanded}
        onToggle={toggle}
      />
    </div>
  );
}
