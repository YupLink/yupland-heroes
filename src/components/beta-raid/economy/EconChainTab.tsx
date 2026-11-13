// «$ Экономика → Блокчейн»: здоровье своего индексатора NEAR, сверка с Sendler и записями
// игры, открытые расхождения (server/chain/recon). Прогон — раз в 10 минут на сервере.
import { useQuery } from "@tanstack/react-query";
import { useLang, useT } from "@/lib/i18n";
import { adminChainRecon, type ChainIssueView } from "@/server/api/chain-recon-admin";

const n = (v: unknown, ru: boolean) => Number(v ?? 0).toLocaleString(ru ? "ru-RU" : "en-US");
const time = (iso: string | null | undefined, ru: boolean) =>
  iso
    ? new Date(iso).toLocaleString(ru ? "ru-RU" : "en-US", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const shortKey = (k: string) => (k.length > 18 ? `${k.slice(0, 8)}…${k.slice(-6)}` : k);
const isTx = (k: string) => /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(k);

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <tr className="border-b border-border/40">
      <td className="px-2 py-1.5">{label}</td>
      <td
        className={`px-2 py-1.5 text-right tabular-nums ${ok === false ? "text-red-400" : ok ? "text-emerald-400" : ""}`}
      >
        {value}
      </td>
    </tr>
  );
}

function Issue({ i, ru }: { i: ChainIssueView; ru: boolean }) {
  const t = useT();
  const d = i.detail;
  const facts = [d.wallet ?? d.from ?? d.to, d.token, d.amount ?? d.credited, d.chain, d.sendler]
    .filter((x) => x !== undefined && x !== null && x !== "")
    .map(String)
    .join(" · ");
  return (
    <li className="border-b border-border/40 px-2 py-1.5 text-[11px]">
      <div
        className={
          i.severity === "alarm" ? "font-semibold text-red-400" : "font-semibold text-amber-400"
        }
      >
        {t(`econ.chain.kind.${i.kind}`)}
      </div>
      <div className="tabular-nums text-muted-foreground">
        {time(String(d.at ?? i.firstSeen), ru)} ·{" "}
        {isTx(i.key) ? (
          <a
            className="underline"
            href={`https://nearblocks.io/txns/${i.key}`}
            target="_blank"
            rel="noreferrer"
          >
            {shortKey(i.key)}
          </a>
        ) : (
          shortKey(i.key)
        )}
        {facts ? ` · ${facts}` : ""}
      </div>
    </li>
  );
}

export function EconChainTab() {
  const t = useT();
  const ru = useLang() === "ru";
  const q = useQuery({
    queryKey: ["admin-chain-recon"],
    queryFn: () => adminChainRecon(),
    refetchInterval: 60_000,
  });
  const v = q.data;
  if (!v) return <p className="p-4 text-sm text-muted-foreground">…</p>;
  const s = v.stats;
  if (!s) return <p className="p-4 text-sm text-muted-foreground">{t("econ.chain.no_run")}</p>;
  const h = s.health ?? { ok_at: null, err: null };
  const okAt = h.ok_at ? Date.parse(String(h.ok_at)) : NaN;
  const ago = Number.isFinite(okAt) ? Math.max(0, Math.round((Date.now() - okAt) / 1000)) : null;
  const pair = (a: unknown, b: unknown) => `${n(a, ru)} / ${n(b, ru)}`;
  const since = t("econ.chain.since", { d: String(s.since).slice(0, 10) });
  return (
    <div className="space-y-4 p-3 text-[12px]">
      <section>
        <h3 className="mb-1 font-semibold">{t("econ.chain.indexer")}</h3>
        <table className="min-w-full border-collapse">
          <tbody>
            <Row
              label={t("econ.chain.last_pass")}
              value={ago == null ? "—" : t("econ.chain.ago", { n: ago })}
              ok={ago != null && ago < 300}
            />
            <Row label={t("econ.chain.day_polls")} value={n(s.day?.polls, ru)} />
            <Row
              label={t("econ.chain.day_errors")}
              value={n(s.day?.errors, ru)}
              ok={(s.day?.errors ?? 0) < 20}
            />
            <Row label={t("econ.chain.day_limited")} value={n(s.day?.rateLimited, ru)} />
            {h.err && <Row label={t("econ.chain.last_error")} value={String(h.err).slice(0, 80)} />}
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="mb-1 font-semibold">
          {t("econ.chain.recon")} · {since} · {t("econ.chain.run_at", { t: time(v.at, ru) })}
        </h3>
        <table className="min-w-full border-collapse">
          <tbody>
            <Row
              label={t("econ.chain.deposits")}
              value={pair(s.deposits.matched, s.deposits.sendler)}
              ok={s.deposits.matched === s.deposits.sendler}
            />
            <Row
              label={t("econ.chain.incoming")}
              value={pair(s.deposits.credited, s.deposits.chainIn)}
              ok={s.deposits.credited === s.deposits.chainIn}
            />
            <Row
              label={t("econ.chain.payouts")}
              value={pair(s.payouts.recorded, s.payouts.chainOut)}
              ok={s.payouts.recorded === s.payouts.chainOut}
            />
            <Row label={t("econ.chain.nft_same")} value={pair(s.nft.same, s.nft.total)} />
            <Row label={t("econ.chain.nft_burned")} value={n(s.nft.burnedOurs, ru)} />
            <Row label={t("econ.chain.nft_moved")} value={n(s.nft.movedAfterSnap, ru)} />
            <Row
              label={t("econ.chain.nft_differs")}
              value={n(s.nft.differs, ru)}
              ok={s.nft.differs === 0}
            />
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="mb-1 font-semibold">
          {v.open.length ? t("econ.chain.open", { n: v.open.length }) : t("econ.chain.none")}
        </h3>
        <ul>
          {v.open.map((i) => (
            <Issue key={i.id} i={i} ru={ru} />
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("econ.chain.resolved", { n: v.resolved7d })}
        </p>
      </section>
    </div>
  );
}
