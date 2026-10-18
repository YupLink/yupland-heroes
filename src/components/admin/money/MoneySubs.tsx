// «Подписки»: сколько внесли и куда ушло — по каждой доле: ушло, ждёт порога,
// встало (пачка не дошла и ждёт сверки с сетью). Данные — money-subs.ts.
import type { MoneySubs as Subs, SubFlow } from "@/server/api/money-subs";
import { Card, big, exact } from "./moneyShared";

const TO: Record<SubFlow["to"], string> = { map: "Пул карты", duplo: "Дупло", dev: "Разработчикам" };
const TOKEN: Record<string, string> = { Darai: "DARAI", USDT: "USDT", STARS: "⭐", GRANT: "выдано" };

function Num({ v, tone }: { v: number; tone?: "danger" }) {
  if (!(v > 0)) return <span className="text-muted-foreground/50">—</span>;
  return (
    <span className={tone === "danger" ? "font-semibold text-destructive" : "font-semibold"} title={exact(v)}>
      {big(v)}
    </span>
  );
}

const time = (s: string) =>
  new Date(s.replace(" ", "T")).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function MoneySubs({ subs }: { subs: Subs }) {
  return (
    <Card title="Подписки и наборы">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {subs.paid.map((p) => (
          <div key={p.token} className="tabular-nums" title={exact(p.amount)}>
            <span className="font-display text-xl font-bold">{p.token === "GRANT" ? p.count : big(p.amount)}</span>{" "}
            <span className="text-[13px] text-muted-foreground">
              {TOKEN[p.token] ?? p.token}
              {p.token !== "GRANT" && ` · ${p.count} шт`}
            </span>
          </div>
        ))}
        {subs.stars > 0 && (
          <div className="tabular-nums">
            <span className="font-display text-xl font-bold">{big(subs.stars)}</span>{" "}
            <span className="text-[13px] text-muted-foreground">⭐ в пуле</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-x-3 gap-y-2 text-[13px] tabular-nums">
        <span />
        <span className="text-right text-[11px] text-muted-foreground">Ушло</span>
        <span className="text-right text-[11px] text-muted-foreground">Ждёт</span>
        <span className="text-right text-[11px] text-muted-foreground">Встало</span>
        {subs.flows.map((f) => (
          <FlowRow key={`${f.to}-${f.token}`} f={f} />
        ))}
      </div>

      {subs.stuck.length > 0 && (
        <div className="space-y-2 rounded-xl bg-destructive/10 p-3 text-[13px]">
          {subs.stuck.map((s) => (
            <div key={s.id}>
              <div className="font-semibold text-destructive">
                {big(s.left)} {s.token} · {s.what}
              </div>
              <div className="text-[11px] text-muted-foreground">
                с {time(s.since)}
                {s.error && <span className="line-clamp-2 break-words">{s.error}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function FlowRow({ f }: { f: SubFlow }) {
  return (
    <>
      <span className="min-w-0">
        <span className="break-words">{TO[f.to]}</span>
        <span className="block text-[11px] text-muted-foreground">
          {f.share} % {f.token}
          {f.gotDarai > 0 && <span className="block whitespace-nowrap">→ {big(f.gotDarai)} DARAI</span>}
        </span>
      </span>
      <span className="text-right">
        <Num v={f.sent} />
      </span>
      <span className="text-right">
        <Num v={f.waiting} />
      </span>
      <span className="text-right">
        <Num v={f.stuck} tone="danger" />
      </span>
    </>
  );
}
