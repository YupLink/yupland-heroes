// «К раздаче»: кому сколько уйдёт, если разослать прямо сейчас, и когда это
// случится само — пороги авторассылок правятся тут же (MoneyAutoRule).
import type { MoneyOverview } from "@/server/api/money-overview";
import { Card, big, exact } from "./moneyShared";
import { MoneyAutoRule } from "./MoneyAutoRule";

export function MoneyReady({ ready }: { ready: MoneyOverview["ready"] }) {
  const rows = ready.recipients.filter((r) => r.darai > 0 || r.usdt > 0 || r.viaSwap > 0 || r.key !== "map");
  return (
    <Card title="К раздаче">
      <div>
        {rows.map((r) => (
          <div key={r.key} className="flex items-start justify-between gap-3 py-1.5 text-[13px]">
            <div className="min-w-0">
              <div className="break-words">{r.name}</div>
              {r.wallet && <div className="break-all font-mono text-[11px] text-muted-foreground">{r.wallet}</div>}
            </div>
            <div className="shrink-0 whitespace-nowrap text-right tabular-nums">
              {(r.darai > 0 || (r.usdt === 0 && r.viaSwap === 0)) && (
                <div className="font-semibold" title={`${exact(r.darai)} DARAI`}>
                  {big(r.darai)} DARAI
                </div>
              )}
              {r.usdt > 0 && (
                <div className="font-semibold" title={`${exact(r.usdt)} USDT`}>
                  {big(r.usdt)} USDT
                </div>
              )}
              {r.viaSwap > 0 && (
                <div className="text-[11px] text-muted-foreground" title={`${exact(r.viaSwap)} USDT до обмена`}>
                  {big(r.viaSwap)} USDT → {ready.daraiPerUsdt ? `≈${big(r.viaSwap * ready.daraiPerUsdt)} ` : ""}DARAI
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* dist нет в ответе старого вида (сохранённый кэш браузера) — правила
          покажем, как придёт свежий ответ, а не уроним всю вкладку. */}
      {ready.dist && (
        <div className="space-y-4 border-t border-border/60 pt-3">
          <h4 className="text-[13px] font-semibold">Авторассылки</h4>
          <MoneyAutoRule ruleKey="darai_free" label="Раздача DARAI" now={ready.free} unit="DARAI" dist={ready.dist} />
          <MoneyAutoRule
            ruleKey="sub_darai"
            label="Подписки за DARAI"
            now={ready.subDarai / 0.4}
            unit="DARAI"
            dist={ready.dist}
          />
          <MoneyAutoRule ruleKey="sub_usd" label="Подписки за USDT" now={ready.subUsdt} unit="USDT" dist={ready.dist} />
          <MoneyAutoRule
            ruleKey="auc_darai"
            label="Аукционы админа · DARAI"
            now={ready.aucDarai ?? 0}
            unit="DARAI"
            dist={ready.dist}
          />
          <MoneyAutoRule
            ruleKey="auc_usd"
            label="Аукционы админа · USDT"
            now={ready.aucUsdt ?? 0}
            unit="USDT"
            dist={ready.dist}
          />
        </div>
      )}
    </Card>
  );
}
