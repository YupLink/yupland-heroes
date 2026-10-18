// Зачесть перевод по хэшу руками.
//
// Запасной путь, а не основной. Основной — подписать в игре и получить
// зачисление через минуту; сюда попадают переводы, отправленные со стороны, и
// редкие случаи, когда автоматика по какой-то причине не догнала.
import { Loader2 } from "lucide-react";

export function TopUpByHash({
  hash,
  onHash,
  symbol,
  busy,
  onCredit,
}: {
  hash: string;
  onHash: (v: string) => void;
  symbol?: string;
  busy: boolean;
  onCredit: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border/60 bg-secondary/10 p-3">
      <div className="text-[11px] text-muted-foreground">
        Перевод отправлен со стороны? Вставь хэш — зачтём.
      </div>
      <input
        value={hash}
        onChange={(e) => onHash(e.target.value)}
        placeholder="хэш перевода"
        spellCheck={false}
        autoCapitalize="off"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] outline-none focus:border-gold/60"
      />
      <button
        type="button"
        onClick={onCredit}
        disabled={hash.trim().length < 20 || busy || !symbol}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-medium transition hover:bg-secondary disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Зачесть по хэшу как {symbol ?? "—"}
      </button>
    </div>
  );
}
