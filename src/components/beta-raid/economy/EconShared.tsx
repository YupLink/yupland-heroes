// Мелочи, общие для новых вкладок Экономики: лоадер, ошибка, пустота,
// «Ещё», число со знаком, кнопка-имя игрока и классы липкого заголовка.
// Одно место — чтобы четыре вкладки и лента выглядели одной панелью.
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { requestCenter } from "../centerMapBus";
import { fmt } from "./economyFormat";

/** Липкий заголовок таблицы: top-0, если над таблицей ничего нет. */
export const TH = "sticky top-0 z-20 border-b border-border bg-background px-2 py-2 font-semibold";
/** …и top-[48px], когда сверху одностроковая панель фильтра (h-12). */
export const TH_UNDER_BAR =
  "sticky top-[48px] z-20 border-b border-border bg-background px-2 py-2 font-semibold";
/** Панель фильтра над таблицей — ровно 48px, см. TH_UNDER_BAR. */
export const FILTER_BAR =
  "sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur";
export const SELECT =
  "min-w-0 rounded-lg border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-gold/60";
export const TEXT_INPUT =
  "min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-[12px] outline-none focus:border-gold/60";

export function EconSpinner() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-gold" />
    </div>
  );
}

export function EconError({ error }: { error: unknown }) {
  const t = useT();
  const msg = error instanceof Error ? error.message : String(error);
  return <div className="p-4 text-sm text-red-400">{t("econ.error", { msg })}</div>;
}

export function EconEmpty({ text }: { text: string }) {
  return <div className="p-4 text-sm text-muted-foreground">{text}</div>;
}

export function EconMore({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  const t = useT();
  return (
    <div className="p-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="w-full rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition hover:border-gold/60 hover:text-gold disabled:opacity-50"
      >
        {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("econ.more")}
      </button>
    </div>
  );
}

/** Число со знаком: плюс зелёный, минус красный, ноль приглушён. */
export function Signed({ v, className }: { v: number | null; className?: string }) {
  if (v == null || !Number.isFinite(v)) {
    return <span className={cn("text-muted-foreground/40", className)}>—</span>;
  }
  if (v === 0) return <span className={cn("text-muted-foreground/40", className)}>·</span>;
  return (
    <span className={cn(v > 0 ? "text-emerald-300" : "text-red-300", "tabular-nums", className)}>
      {v > 0 ? "+" : "−"}
      {fmt(Math.abs(v))}
    </span>
  );
}

/** Имя игрока как кнопка: открывает ленту. Не всплывает к строке-раскрывашке. */
export function PlayerName({ name, onClick }: { name: string; onClick?: () => void }) {
  if (!onClick) return <span className="font-semibold">{name}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="max-w-[9rem] truncate text-left font-semibold text-gold underline-offset-2 hover:underline"
      title={name}
    >
      {name}
    </button>
  );
}

/**
 * Координаты как кнопка: тап центрирует карту на клетке через centerMapBus
 * (панель не закрывается — карта под ней). Показываем только «q,r»: карта
 * одна, а «rmap_…:» перед каждой парой съедал полстроки. Идентификатор карты
 * оставлен в title.
 */
export function EconCell({
  mapId,
  q,
  r,
}: {
  mapId: string | null;
  q: number | null;
  r: number | null;
}) {
  const t = useT();
  if (q == null || r == null) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        requestCenter({ q, r, ttlMs: 3000 });
      }}
      title={`${mapId ?? ""} · ${t("econ.cell.go")}`}
      className="rounded px-1 font-mono text-gold underline decoration-gold/40 underline-offset-2 hover:bg-gold/10"
    >
      {q},{r}
    </button>
  );
}
