// YUPLINK · Блок «Источник» на экране раздачи DARAI.
//
// Зачем раскладка, а не одна цифра: на darai_gdrop.near лежат вперемешку
// две кучи — доход с продаж и игровой пул, который завела коллекция под
// награды на карте. Раздавать холдерам можно только первую, поэтому кошелёк
// показываем в три строки: всего / из них под карту / к распределению.

import { Wallet, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt, CopyChip, type DaraiPreview } from "./daraiPayoutShared";

function Row({
  label,
  value,
  hint,
  tone = "muted",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "muted" | "danger" | "accent";
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 py-1">
      <div className="min-w-0">
        <span
          className={cn(
            "text-[11px]",
            tone === "danger" ? "text-rose-300" : "text-muted-foreground"
          )}
        >
          {label}
        </span>
        {hint && (
          <span className="ml-1 text-[10px] text-muted-foreground/70">
            {hint}
          </span>
        )}
      </div>
      <span
        className={cn(
          "shrink-0 font-mono text-sm tabular-nums",
          tone === "danger" && "text-rose-300",
          tone === "accent" && "text-base font-bold text-neon",
          tone === "muted" && "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function DaraiSourceCard({
  d,
  onRefresh,
  refreshing,
}: {
  d: DaraiPreview;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const p = d.pools;
  // Отрицательный остаток пула = под объекты карты заложено больше, чем
  // коллекция внесла. Из раздачи такой «долг» не вычитаем (иначе раздали бы
  // больше, чем есть), но показываем красным — это дыра, её надо закрыть.
  const negative = p.mapReserved < 0;
  const reservedForMap = Math.max(0, p.mapReserved);

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-4 transition hover:border-border/80">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          Источник
        </div>
        <button
          type="button"
          onClick={onRefresh}
          title="Обновить баланс источника"
          aria-label="Обновить баланс источника"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-secondary/40 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
        </button>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
          {d.sourceWallet}
        </span>
        <CopyChip value={d.sourceWallet} label="кошелёк-источник" />
      </div>

      <div className="mt-2 divide-y divide-border/40 border-t border-border/40">
        <Row label="Всего на кошельке" value={`${fmt(p.walletBalance)} DARAI`} />
        <Row
          label={negative ? "Игровой пул под карту — в минусе" : "Игровой пул под карту"}
          hint={negative ? undefined : "в раздачу не идёт"}
          tone={negative ? "danger" : "muted"}
          // Минус рисуем только когда пул реально что-то откусывает: «− 0,00»
          // выглядит как ошибка вёрстки, а не как «пул пуст».
          value={`${reservedForMap > 0 ? "− " : ""}${fmt(p.mapReserved)} DARAI`}
        />
        {/* Что ещё лежит на кошельке, но уже чьё-то — в раздачу не идёт. */}
        {(
          [
            ["Обещано на карте (живые объекты)", p.onMapNow],
            ["Счета игроков", p.playersOnAccounts],
            ["Старые DARAI-счета игроков", p.legacyBalances],
            ["Склады игроков", p.warehouseDarai],
            ["Награды босса не забраны", p.bossRewards],
            ["Ручные заявки ждут TG", p.pendingRequests],
            ["Фонды идущих турниров", p.tournamentFunds],
            ["Банк: лицензии и пулы", p.bankDarai],
            ["Награды в очереди", p.rewardsQueue],
            ["Выводы в работе", p.inFlight],
            ["Подарки не получены", p.giftsPending],
            ["Корзины подписки", p.subReserve],
            ["Пополнения казны в пути", p.unsettledDeposits],
          ] as Array<[string, number]>
        )
          .filter(([, v]) => v > 0)
          .map(([label, v]) => (
            <Row key={label} label={label} hint="в раздачу не идёт" tone="muted" value={`− ${fmt(v)} DARAI`} />
          ))}
        <Row
          label="К распределению"
          value={`${fmt(Math.max(0, p.payoutAvailable))} DARAI`}
          tone="accent"
        />
      </div>

      {negative && (
        <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-2 text-[10px] leading-relaxed text-rose-200">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Заложено под объекты карты больше, чем внесено коллекцией, на{" "}
            <span className="font-mono">{fmt(Math.abs(p.mapReserved))}</span>{" "}
            DARAI. Награды на карте сейчас не обеспечены игровым пулом — их
            выплатит доход с продаж.
          </span>
        </div>
      )}

      <div className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        внесено коллекцией:{" "}
        <span className="font-mono text-foreground/80">
          {fmt(p.collectionDeposited)}
        </span>{" "}
        · заложено под объекты карты:{" "}
        <span className="font-mono text-foreground/80">{fmt(p.mapSpent)}</span>
        {!negative && reservedForMap > 0 && (
          <>
            {" "}
            · остаток пула:{" "}
            <span className="font-mono text-foreground/80">
              {fmt(reservedForMap)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
