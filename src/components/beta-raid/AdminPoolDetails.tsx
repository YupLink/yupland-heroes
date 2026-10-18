// Расшифровка под плашкой пула: куда делись деньги.
//
// Одно число «пул карты» читалось как «деньги утекают сами»: оно падает на
// каждой новой закладке и возвращается только если объект снять. Здесь видно
// весь путь — внесли, пообещали, сколько ещё стоит на карте, сколько унесли
// игроки. На телефоне подсказка по наведению недоступна, поэтому список
// раскрывается тапом по самой плашке.
export type PoolLine = { label: string; value: string; muted?: boolean };

export function AdminPoolDetails({ lines }: { lines: PoolLine[] }) {
  return (
    <div className="w-full rounded-lg border border-border/60 bg-black/40 px-2 py-1.5">
      {lines.map((l) => (
        <div key={l.label} className="flex items-center justify-between gap-2 py-0.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {l.label}
          </span>
          <span
            className={
              l.muted
                ? "text-[11px] tabular-nums text-muted-foreground"
                : "text-[11px] font-semibold tabular-nums text-foreground"
            }
          >
            {l.value}
          </span>
        </div>
      ))}
    </div>
  );
}
