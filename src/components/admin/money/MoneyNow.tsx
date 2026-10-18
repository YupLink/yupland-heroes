// «Кошелёк»: что лежит на darai_gdrop.near и чьё это — DARAI и USDT по
// переключателю. «Свободно» — то, что ничьё: его можно раздавать или менять.
import { useState } from "react";
import type { MoneyOverview } from "@/server/api/money-overview";
import { Card, Hero, Row, Segmented, Stack } from "./moneyShared";

type Token = "darai" | "usdt";

export function MoneyNow({ now }: { now: MoneyOverview["now"] }) {
  const [token, setToken] = useState<Token>("darai");
  return (
    <Card
      title="Кошелёк"
      aside={
        <Segmented
          value={token}
          onChange={setToken}
          options={[
            { key: "darai", label: "DARAI" },
            { key: "usdt", label: "USDT" },
          ]}
        />
      }
    >
      {token === "darai" ? <Darai now={now} /> : <Usdt now={now} />}
    </Card>
  );
}

function Darai({ now }: { now: MoneyOverview["now"] }) {
  const p = now.pools;
  const promised =
    p.rewardsQueue + p.bossRewards + p.warehouseDarai + p.giftsPending + p.inFlight +
    p.pendingRequests + p.tournamentFunds + p.bankDarai;
  const parts = [
    { label: "Пул карты", value: Math.max(0, p.mapReserved), cls: "bg-emerald-500" },
    { label: "Разложено на карте", value: p.onMapNow, cls: "bg-emerald-300" },
    { label: "Счета игроков", value: p.playersOnAccounts + p.legacyBalances, cls: "bg-sky-500" },
    { label: "Обещано игрокам", value: promised, cls: "bg-violet-500" },
    { label: "Подписки, ждут рассылки", value: p.subReserve, cls: "bg-amber-500" },
    { label: "Пополнение казны в пути", value: p.unsettledDeposits, cls: "bg-slate-400" },
    { label: "Свободно", value: Math.max(0, p.payoutAvailable), cls: "bg-gold" },
  ];
  return (
    <>
      <Hero value={p.walletBalance} unit="DARAI" />
      <Stack parts={parts} total={p.walletBalance} />
      <div>
        {parts
          .filter((x) => x.value > 0 || x.cls === "bg-gold")
          .map((x) => (
            <Row
              key={x.label}
              label={x.label}
              value={x.value}
              dot={x.cls}
              tone={x.cls === "bg-gold" ? "accent" : undefined}
            />
          ))}
      </div>
    </>
  );
}

function Usdt({ now }: { now: MoneyOverview["now"] }) {
  const u = now.usdt;
  if (!u) return <div className="text-[13px] text-muted-foreground">Не прочиталось</div>;
  const free = u.free ?? 0;
  return (
    <>
      <Hero value={u.walletBalance ?? 0} unit="USDT" />
      <div>
        <Row label="Счета игроков" value={u.playerBalances} unit="USDT" />
        <Row label="Разложено на карте" value={u.onMap} unit="USDT" />
        <Row label="Награды и выводы игроков" value={u.queuedRewards + u.payoutsPending} unit="USDT" />
        <Row label="Подписки и подарки" value={u.reserved} unit="USDT" />
        {free < 0 ? (
          <Row label="Перерасход" value={free} unit="USDT" tone="danger" />
        ) : (
          <Row label="Свободно" value={free} unit="USDT" tone="accent" />
        )}
      </div>
    </>
  );
}
