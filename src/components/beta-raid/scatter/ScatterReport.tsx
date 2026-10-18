// Отчёт раздачи — один и тот же блок для предпросмотра и для результата.
//
// Разница между ними ровно одна: слово сверху. «Будет так» показывает сухой
// прогон, «Готово» — уже сделанное. Держать для этого две разные вёрстки
// значило бы, что админ сверяет обещание с результатом по разным таблицам.
//
// «Не влезло» и «не на своей местности» стоят рядом с «создано» намеренно: это
// не ошибки, а честный остаток — свободных клеток нужного типа на карте
// конечное число.
//
// Минус по деньгам вынесен НАВЕРХ и в свою красную рамку. Раздачу он не
// запрещает (владелец: админ раздаёт в «-» осознанно), но строчкой в общем
// списке примечаний, между «потолками шаблонов» и «не на своей местности», его
// бы просто не заметили.
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GROUP_LABEL,
  type ScatterReport as Report,
  type ScatterShortfall,
} from "@/lib/raid/scatterPlan";
import { fmtNum } from "./scatterFormat";

function Num({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <span className={cn("tabular-nums", warn && value > 0 ? "text-amber-400" : undefined)}>
      {label} <b className={value > 0 ? "text-foreground" : undefined}>{fmtNum(value)}</b>
    </span>
  );
}

/**
 * Красная рамка «раздача уходит в минус».
 *
 * Числа даём все три: сколько обещаем, сколько было свободно и на сколько
 * проваливаемся ниже нуля — «не хватает» без чисел лечить нечем. Дробные
 * разряды у токенов настоящие (0,5 USDT), поэтому не режем.
 */
function Shortfalls({ list, done }: { list: ScatterShortfall[]; done: boolean }) {
  if (list.length === 0) return null;
  return (
    <div className="space-y-1 rounded-lg border border-destructive/70 bg-destructive/10 p-2">
      <p className="flex items-center gap-1.5 text-[12px] font-bold text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {done ? "Роздано в минус" : "Раздача уйдёт в минус"}
      </p>
      {list.map((s) => (
        <p key={s.symbol} className="text-[11px] leading-tight">
          {s.source === "pool" ? "Пул карты" : `Свободные ${s.symbol}`}:{" "}
          {done ? "роздано" : "раздаём"} <b className="tabular-nums">{fmtNum(s.need, 6)}</b>,
          свободно было <b className="tabular-nums">{fmtNum(s.free, 6)}</b> —{" "}
          {done ? "ушли" : "уходим"} в минус на{" "}
          <b className="tabular-nums text-destructive">{fmtNum(s.gap, 6)}</b>
        </p>
      ))}
      <p className="text-[10px] leading-tight text-muted-foreground">
        Раздаче это не мешает. Пополни пул карты или кошелёк — обещанное игрокам придётся чем-то
        закрыть
      </p>
    </div>
  );
}

export function ScatterReport({
  report,
  loading,
  done,
}: {
  report: Report | undefined;
  loading: boolean;
  /** Раздача уже выполнена — это результат, а не обещание. */
  done: boolean;
}) {
  if (loading) {
    return (
      <div className="flex h-20 items-center justify-center rounded-xl border border-border">
        <Loader2 className="h-5 w-5 animate-spin text-gold" />
      </div>
    );
  }
  if (!report) return null;

  const created = report.groups.reduce((s, g) => s + g.created, 0);
  const removed = report.groups.reduce((s, g) => s + g.removed, 0);

  return (
    <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/[0.04] p-2">
      <p
        className={cn(
          "flex items-center gap-1.5 text-[12px] font-bold",
          done ? "text-emerald-400" : "text-gold",
        )}
      >
        {done && <CheckCircle2 className="h-4 w-4" />}
        {done
          ? `Готово · создано ${fmtNum(created)}, снято ${fmtNum(removed)}`
          : `Будет так · создано ${fmtNum(created)}, снято ${fmtNum(removed)}`}
      </p>

      <Shortfalls list={report.shortfalls} done={done} />

      <div className="divide-y divide-border/60 rounded-lg border border-border/60">
        {report.groups.map((g) => (
          <div key={g.group} className="p-2">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold">{GROUP_LABEL[g.group] ?? g.group}</span>
              <span className="tabular-nums text-gold">
                <b>{fmtNum(g.created)}</b> на карту
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              <Num label="снято" value={g.removed} />
              {/* Две недостачи врозь: «не влезло» лечится местом на карте,
                  «клетку заняли» — просто повтором раздачи. */}
              <Num label="не влезло" value={g.short} warn />
              <Num label="клетку заняли" value={g.lost} warn />
              <Num label="не на своей местности" value={g.offLand} warn />
            </div>
          </div>
        ))}
      </div>

      {report.resources.length > 0 && (
        <div className="space-y-0.5 rounded-lg border border-border/60 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            На карту поступило
          </p>
          {report.resources.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-[12px]">
              <span>{r.label}</span>
              {/* Дробные суммы у токенов реальны (0,5 USDT) — не режем их в ноль. */}
              <b className="tabular-nums text-gold">{fmtNum(r.amount, 6)}</b>
            </div>
          ))}
        </div>
      )}

      {report.notes.length > 0 && (
        <ul className="space-y-1">
          {report.notes.map((n, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] leading-tight text-amber-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
