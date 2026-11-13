// «Уже разослано», «Игроки», «Пул карты»: история денег — сколько ушло нам и
// в дупло, сколько игроки ввели и вывели, чем наполнялась карта и что с неё собрали.
import type { MoneyOverview } from "@/server/api/money-overview";
import { Card, Hero, Row } from "./moneyShared";

export function MoneySent({ sent }: { sent: MoneyOverview["sent"] }) {
  return (
    <Card title="Уже разослано" aside={<span className="text-[12px] text-muted-foreground">раздач: {sent.count}</span>}>
      <Hero value={sent.total} unit="DARAI" />
      <div>
        <Row label="Дупло" value={sent.duplo} />
        <Row label={sent.labels.owner} value={sent.owner} />
        <Row label={sent.labels.partner} value={sent.partner} />
        <Row label="Держатели legendary" value={sent.legendary} />
        {sent.devUsdt > 0 && <Row label="Разработчикам из подписок" value={sent.devUsdt} unit="USDT" />}
        {sent.failed > 0 && <Row label="Встали" value={sent.failed} unit="шт" tone="danger" />}
        {sent.duploOnChain != null && (
          <Row label="В дупле всего, с другими проектами" value={sent.duploOnChain} tone="muted" />
        )}
      </div>
    </Card>
  );
}

export function MoneyFlows({ players, map }: { players: MoneyOverview["players"]; map: MoneyOverview["map"] }) {
  const inTotal = map.treasury + map.swaps + map.subs + map.spend + Math.max(0, map.fixes);
  return (
    <>
      <Card title="Игроки">
        <Hero value={players.onAccounts} unit="DARAI" />
        <div>
          <Row label="Введено" value={players.deposited} />
          <Row label="Выведено на кошельки" value={players.withdrawn} />
          {players.inFlight > 0 && <Row label="Выводы в работе" value={players.inFlight} tone="muted" />}
          <Row label="Получено наградами" value={players.rewards} />
          <Row label="Потрачено в игре" value={players.spent} />
        </div>
      </Card>
      <Card title="Пул карты">
        <Hero value={map.balance} unit="DARAI" />
        <div>
          <Row label="Наполнено всего" value={inTotal} />
          <div className="pl-3">
            <Row label="казна" value={map.treasury} tone="muted" />
            <Row label="обмены USDT → DARAI" value={map.swaps} tone="muted" />
            <Row label="траты игроков на карте" value={map.spend} tone="muted" />
            <Row label="подписки и наборы" value={map.subs} tone="muted" />
          </div>
          <Row label="Собрано игроками с карты" value={map.collected} />
          <Row label="Лежит на карте" value={map.onMapNow} />
          <Row label="Шахты и выкуп маркетом" value={map.mines + map.buyback} />
        </div>
      </Card>
    </>
  );
}
