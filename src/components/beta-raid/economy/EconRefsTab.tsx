// «$ Экономика → Рефералы» (владелец, 02.11.2026): самые удачные пригласившие и
// статистика по каждому другу. Тап по пригласившему — его друзья: когда пришёл,
// сколько потратил ($) и сколько золота принёс по рефке золотом (§8.101).
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { adminRefFriends, adminRefInviters } from "@/server/api/referral-gold/ref-admin";
import { TH_UNDER_BAR } from "./EconShared";

const num = (n: number) => Math.round(n).toLocaleString("ru-RU");
const usd = (n: number) => `$${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`;

function Friends({ inviter }: { inviter: string }) {
  const t = useT();
  const q = useQuery({
    queryKey: ["admin-ref-friends", inviter],
    queryFn: () => adminRefFriends({ data: { inviter } }),
  });
  if (!q.data) return <p className="px-2 py-2 text-[11px] text-muted-foreground">…</p>;
  return (
    <table className="min-w-full border-collapse text-[11px]">
      <thead className="text-[10px] uppercase text-muted-foreground">
        <tr>
          <th className="px-2 py-1 text-left">{t("econ.refs.friend")}</th>
          <th className="px-2 py-1 text-left">{t("econ.refs.joined")}</th>
          <th className="px-2 py-1 text-right">{t("econ.refs.spent")}</th>
          <th className="px-2 py-1 text-right">{t("econ.refs.gold")}</th>
        </tr>
      </thead>
      <tbody>
        {q.data.map((f) => (
          <tr key={f.wallet} className="border-b border-border/40">
            <td className="px-2 py-1">{f.name ? `@${f.name}` : f.wallet}</td>
            <td className="px-2 py-1 tabular-nums text-muted-foreground">{f.joined ?? "—"}</td>
            <td className="px-2 py-1 text-right tabular-nums">{usd(f.usd)}</td>
            <td className="px-2 py-1 text-right tabular-nums">{num(f.refGold)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EconRefsTab() {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["admin-ref-inviters"],
    queryFn: () => adminRefInviters(),
    staleTime: 60_000,
  });
  if (!q.data)
    return <p className="p-3 text-xs text-muted-foreground">{q.error ? String(q.error) : "…"}</p>;
  return (
    <table className="min-w-full border-collapse text-[11px]">
      <thead className="text-[10px] uppercase text-muted-foreground">
        <tr>
          <th className={`${TH_UNDER_BAR} text-left`}>{t("econ.refs.inviter")}</th>
          <th className={`${TH_UNDER_BAR} text-right`}>{t("econ.refs.friends")}</th>
          <th className={`${TH_UNDER_BAR} text-right`}>{t("econ.refs.spent10")}</th>
          <th className={`${TH_UNDER_BAR} text-right`}>{t("econ.refs.spent")}</th>
          <th className={`${TH_UNDER_BAR} text-right`}>{t("econ.refs.gold")}</th>
          <th className={`${TH_UNDER_BAR} text-right`}>{t("econ.refs.clicks")}</th>
          <th className={`${TH_UNDER_BAR} text-left`}>{t("econ.refs.last")}</th>
        </tr>
      </thead>
      <tbody>
        {q.data.map((r) => (
          <Fragment key={r.wallet}>
            <tr
              onClick={() => setOpen(open === r.wallet ? null : r.wallet)}
              className="cursor-pointer border-b border-border/60 hover:bg-secondary/30"
            >
              <td className="px-2 py-1">{r.name ? `@${r.name}` : r.wallet}</td>
              <td className="px-2 py-1 text-right tabular-nums">{r.friends}</td>
              <td className="px-2 py-1 text-right tabular-nums">{r.spent10}</td>
              <td className="px-2 py-1 text-right tabular-nums">{usd(r.usd)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{num(r.refGold)}</td>
              <td className="px-2 py-1 text-right tabular-nums">{r.clicks}</td>
              <td className="px-2 py-1 tabular-nums text-muted-foreground">
                {r.lastFriend ?? "—"}
              </td>
            </tr>
            {open === r.wallet && (
              <tr>
                <td colSpan={7} className="bg-secondary/20 px-2 py-1">
                  <Friends inviter={r.wallet} />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
