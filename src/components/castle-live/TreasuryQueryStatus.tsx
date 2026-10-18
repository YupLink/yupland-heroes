import { useLang } from "@/lib/i18n";

type TreasuryQuery = { isPending: boolean; isError: boolean; refetch: () => unknown };

export function TreasuryQueryStatus({ query }: { query: TreasuryQuery }) {
  const en = useLang() === "en";
  if (query.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {en ? "Loading…" : "Загрузка…"}
      </p>
    );
  if (!query.isError) return null;
  return (
    <div role="alert" className="space-y-2 text-sm text-destructive">
      <p>{en ? "Could not load data." : "Не удалось загрузить данные."}</p>
      <button
        data-game-button="secondary"
        type="button"
        className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        onClick={() => void query.refetch()}
      >
        {en ? "Retry" : "Повторить"}
      </button>
    </div>
  );
}
