// Одна запись справочника: значок, название, что это, где важно, таблица.
import { pick, type GuideEntry, type GuideIcon, type GuideLang } from "./guideTypes";

function EntryIcon({ icon }: { icon?: GuideIcon }) {
  if (!icon) return <span className="h-9 w-9 shrink-0" />;
  if ("src" in icon) {
    return <img src={icon.src} alt="" loading="lazy" className="h-9 w-9 shrink-0 object-contain" />;
  }
  const { Icon, color } = icon;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/40">
      <Icon className="h-5 w-5" style={{ color }} />
    </span>
  );
}

export function GuideCard({
  entry,
  lang,
  whereLabel,
}: {
  entry: GuideEntry;
  lang: GuideLang;
  whereLabel: string;
}) {
  const table = entry.table;
  return (
    <article id={`p-${entry.id}`} className="rounded-xl border border-border bg-card p-3">
      <div className="flex gap-3">
        <EntryIcon icon={entry.icon} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold leading-tight">
            {pick(entry.name, lang)}
          </h3>
          <p className="mt-1 text-sm leading-snug text-foreground/90">{pick(entry.what, lang)}</p>
          {entry.where && (
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              <span className="font-semibold text-gold">{whereLabel}</span>{" "}
              {pick(entry.where, lang)}
            </p>
          )}
        </div>
      </div>
      {table && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[320px] text-xs">
            <thead>
              <tr className="text-muted-foreground">
                {table.cols.map((col, i) => (
                  <th
                    key={i}
                    className={`px-1.5 py-1 font-semibold ${i === 0 ? "text-left" : "text-center"}`}
                  >
                    {pick(col, lang)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="border-t border-border/60">
                  {row.map((cell, i) => (
                    <td
                      key={i}
                      className={`px-1.5 py-1 ${i === 0 ? "text-left" : "text-center tabular-nums"}`}
                    >
                      {typeof cell === "string" ? cell : pick(cell, lang)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
