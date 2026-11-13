// Bank UI uses the existing exchange, stake and license APIs. Player sections are
// separated so the primary action stays near its input on narrow screens.
import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { BankExchange } from "./BankExchange";
import { BankLicenses } from "./BankLicenses";
import { BankPools } from "./BankPools";
import { BankRefund } from "./BankRefund";
import { BankStake } from "./BankStake";
import "./bank-window.css";

const BankStats = lazy(() => import("./BankStats").then((m) => ({ default: m.BankStats })));

type AdminPage = "pools" | "stats";
type PlayerTab = "exchange" | "stakes" | "licenses";

export function BankScreen({ ru }: { ru: boolean }) {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const admin = session.data?.isAdmin === true;
  const [adminPage, setAdminPage] = useState<AdminPage | null>(null);
  const [playerTab, setPlayerTab] = useState<PlayerTab>("exchange");

  if (admin && adminPage) {
    return <div className="bank-player">
      <div className="bank-player__manage-head">
        <button type="button" onClick={() => setAdminPage(null)}>← {ru ? "Назад" : "Back"}</button>
        <h2>{ru ? "Управление" : "Manage"}</h2>
      </div>
      <nav className="bank-player__admin-tabs" aria-label={ru ? "Управление банком" : "Bank management"}>
        <button type="button" aria-current={adminPage === "pools" ? "page" : undefined} onClick={() => setAdminPage("pools")}>{ru ? "Пулы" : "Pools"}</button>
        <button type="button" aria-current={adminPage === "stats" ? "page" : undefined} onClick={() => setAdminPage("stats")}>{ru ? "Статистика" : "Stats"}</button>
      </nav>
      <div className="bank-player__content">
        {adminPage === "pools" && <BankPools ru={ru} />}
        {adminPage === "stats" && <Suspense fallback={<p role="status">{ru ? "Загрузка…" : "Loading…"}</p>}><BankStats ru={ru} /></Suspense>}
      </div>
    </div>;
  }

  const tabs: Array<[PlayerTab, string]> = [
    ["exchange", ru ? "Обмен" : "Exchange"],
    ["stakes", ru ? "Вклады" : "Deposits"],
    ["licenses", ru ? "Лицензия" : "License"],
  ];

  return <div className="bank-player">
    <nav className="bank-player__tabs" aria-label={ru ? "Вкладки банка" : "Bank tabs"}>
      {tabs.map(([id, label]) => <button key={id} type="button" aria-current={playerTab === id ? "page" : undefined} onClick={() => setPlayerTab(id)}><span className={`bank-player__tab-icon bank-player__tab-icon--${id}`} aria-hidden="true" />{label}</button>)}
    </nav>
    {admin && <div className="bank-player__manage-entry">
      <button type="button" onClick={() => setAdminPage("pools")}>{ru ? "Управление" : "Manage"} ›</button>
    </div>}
    <div className="bank-player__content">
      {playerTab === "exchange" && <>
        <BankRefund ru={ru} />
        <BankExchange ru={ru} onLicenseClick={() => setPlayerTab("licenses")} />
      </>}
      {playerTab === "stakes" && <BankStake ru={ru} />}
      {playerTab === "licenses" && <BankLicenses ru={ru} />}
    </div>
  </div>;
}
