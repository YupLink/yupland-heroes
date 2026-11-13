// Один мир на странице «Сверка порталов»: счёт порталов по видам и таблица
// межмировых входов (куда ведут, сколько игроков видят).
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useT } from "@/lib/i18n";
import type { PortalCheckWorld } from "@/lib/raid/portalCheck";

const cell = ([q, r]: [number, number]) => `${q},${r}`;

export function PortalWorldCard({ world }: { world: PortalCheckWorld }) {
  const t = useT();
  const parts: Array<[string, number]> = [
    ["pcheck.cross", world.cross.length],
    ["pcheck.inner", world.inner],
    ["pcheck.alone", world.alone],
    ["pcheck.closed", world.closed],
    ["pcheck.doors", world.doors],
  ];
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-lg font-semibold">{world.name}</h2>
        <span className="text-sm text-muted-foreground">
          {t("pcheck.total", { n: world.total })}
        </span>
      </header>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {parts
          .filter(([, n]) => n > 0)
          .map(([key, n]) => (
            <Badge key={key} variant="secondary" className="font-normal">
              {t(key, { n })}
            </Badge>
          ))}
      </div>
      {world.cross.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("pcheck.col_entry")}</TableHead>
              <TableHead>{t("pcheck.col_block")}</TableHead>
              <TableHead>{t("pcheck.col_to")}</TableHead>
              <TableHead className="text-right">{t("pcheck.col_seen")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {world.cross.map((e) => (
              <TableRow key={`${e.q},${e.r}`}>
                <TableCell className="font-mono tabular-nums">{cell([e.q, e.r])}</TableCell>
                <TableCell className="font-mono tabular-nums text-muted-foreground">
                  {e.others.length ? e.others.map(cell).join(" · ") : "—"}
                </TableCell>
                <TableCell>
                  {e.to.join(", ")}
                  {e.alsoHere && (
                    <Badge variant="outline" className="ml-2 font-normal">
                      {t("pcheck.also_here")}
                    </Badge>
                  )}
                  {e.void && (
                    <Badge variant="destructive" className="ml-2 font-normal">
                      {t("pcheck.void")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {t("pcheck.seen", { a: e.seenBy, b: e.onMap })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
