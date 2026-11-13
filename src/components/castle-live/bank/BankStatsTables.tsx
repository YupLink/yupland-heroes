// Таблицы статистики пула (админ): комиссия по токенам (в пул / в пул карты) и
// объём обменов — за 24 ч, 7 дней и всё время; «вытащили» — чистый отток каждой
// стороны с начала и с последнего наполнения.
import type { ReactNode } from "react";
import type { Period, SideStats } from "@/lib/bankStats";
import { TokenBadge } from "./bankUi";
import { fmtOutflow, fmtStat, fmtWhen } from "./bankStatsFmt";

const H2 = "mb-2 font-['Auction_Russo'] text-base text-[#fff0c7]";

function PeriodTable({ ru, children }: { ru: boolean; children: ReactNode }) {
  return (
    <table className="w-full table-fixed border-collapse text-[13px] tabular-nums">
      <thead>
        <tr className="text-[11px] text-[#a59c8c]">
          <th className="w-[28%] py-1 text-left font-semibold" />
          <th className="py-1 text-right font-semibold">{ru ? "24 ч" : "24 h"}</th>
          <th className="py-1 text-right font-semibold">{ru ? "7 дн" : "7 d"}</th>
          <th className="py-1 text-right font-semibold">{ru ? "Всего" : "Total"}</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function TokenHead({ side, ru }: { side: SideStats; ru: boolean }) {
  return (
    <tr>
      <td colSpan={4} className="pt-3 pb-1 text-[#fff0c7]">
        <TokenBadge token={side.token} ru={ru} />
      </td>
    </tr>
  );
}

function Row({ label, p, ru, strong }: { label: string; p: Period; ru: boolean; strong?: boolean }) {
  const cell = `whitespace-nowrap py-1 pl-1 text-right ${strong ? "font-bold text-[#ffd773]" : "text-[#f5ecda]"}`;
  return (
    <tr className="border-t border-[#ffffff10]">
      <td className="py-1 pr-1 text-xs text-[#cdb791]">{label}</td>
      <td className={cell}>{fmtStat(p.d1, ru)}</td>
      <td className={cell}>{fmtStat(p.d7, ru)}</td>
      <td className={cell}>{fmtStat(p.all, ru)}</td>
    </tr>
  );
}

const plus = (x: Period, y: Period): Period => ({ d1: x.d1 + y.d1, d7: x.d7 + y.d7, all: x.all + y.all });

export function BankFeesTable({ sides, ru }: { sides: SideStats[]; ru: boolean }) {
  return (
    <section className="auction-ledger" aria-label={ru ? "Комиссия" : "Fees"}>
      <h3 className={H2}>{ru ? "Комиссия заработана" : "Fees earned"}</h3>
      <PeriodTable ru={ru}>
        {sides.map((s) => (
          <FeeRows key={s.token} side={s} ru={ru} />
        ))}
      </PeriodTable>
    </section>
  );
}

function FeeRows({ side, ru }: { side: SideStats; ru: boolean }) {
  return (
    <>
      <TokenHead side={side} ru={ru} />
      <Row label={ru ? "в пул" : "to pool"} p={side.feePool} ru={ru} />
      <Row label={ru ? "в пул карты" : "to map pool"} p={side.feeMap} ru={ru} />
      <Row label={ru ? "итого" : "sum"} p={plus(side.feePool, side.feeMap)} ru={ru} strong />
    </>
  );
}

export function BankVolumeTable({ sides, swaps, ru }: { sides: SideStats[]; swaps: Period; ru: boolean }) {
  return (
    <section className="auction-ledger" aria-label={ru ? "Объём обменов" : "Swap volume"}>
      <h3 className={H2}>{ru ? "Объём обменов" : "Swap volume"}</h3>
      <PeriodTable ru={ru}>
        <Row label={ru ? "обменов" : "swaps"} p={swaps} ru={ru} strong />
        {sides.map((s) => (
          <VolumeRows key={s.token} side={s} ru={ru} />
        ))}
      </PeriodTable>
    </section>
  );
}

function VolumeRows({ side, ru }: { side: SideStats; ru: boolean }) {
  return (
    <>
      <TokenHead side={side} ru={ru} />
      <Row label={ru ? "отдали в пул" : "paid in"} p={side.volIn} ru={ru} />
      <Row label={ru ? "выдал пул" : "paid out"} p={side.volOut} ru={ru} />
    </>
  );
}

export function BankOutflow({ sides, lastFundAt, ru }: { sides: SideStats[]; lastFundAt: number | null; ru: boolean }) {
  const tone = (v: number) => (v > 0 ? "text-[#f0b4ab]" : v < 0 ? "text-[#8df0b6]" : "text-[#f5ecda]");
  return (
    <section className="auction-ledger" aria-label={ru ? "Вытащили" : "Pulled out"}>
      <h3 className={H2}>{ru ? "Сколько вытащили" : "Pulled out"}</h3>
      <ul className="space-y-3">
        {sides.map((s) => (
          <li key={s.token} className="space-y-1 border-t border-[#ffffff10] pt-2 first:border-0 first:pt-0">
            <TokenBadge token={s.token} ru={ru} />
            <p className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-[#cdb791]">{ru ? "с начала" : "since start"}</span>
              <b className={`whitespace-nowrap tabular-nums ${tone(s.outStart)}`}>{fmtOutflow(s.outStart, ru)}</b>
            </p>
            <p className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 text-[#cdb791]">
                {ru ? "с наполнения" : "since funding"}
                {lastFundAt !== null && <span className="block text-xs text-[#a59c8c]">{fmtWhen(lastFundAt, ru)}</span>}
              </span>
              <b className={`whitespace-nowrap tabular-nums ${tone(s.outSinceFund)}`}>
                {lastFundAt !== null ? fmtOutflow(s.outSinceFund, ru) : "—"}
              </b>
            </p>
            <p className="text-xs text-[#a59c8c] tabular-nums">
              {ru ? "положено" : "funded"} {fmtStat(s.funded, ru)} · {ru ? "сейчас в пуле" : "in pool now"} {fmtStat(s.reserve, ru)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
