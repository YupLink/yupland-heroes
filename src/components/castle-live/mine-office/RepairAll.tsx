// «Починить всё» в «Управлении шахтами» (владелец, 05.11.2026): кнопка в подвале
// окна рядом с «Собрать всё». Два шага:
//  1) выбор — ползунок «Чинить шахты с прочностью ниже N %» (10–100, шаг 5; открывается на пороге,
//     выбранном в прошлый раз, — он на аккаунте), сколько шахт и за сколько
//     (цену считает сервер, getMineRepairAllQuote), «Починить»;
//  2) подтверждение — «Будет починено шахт: N», «Спишется: …», «Подтвердить» /
//     «Отмена». Списание — только после «Подтвердить», ровно по показанной цене:
//     клетки и порог берутся из снимка шага 1, повтор нажатия второй раз не платит.
// Остров и сломанные не чинятся. Цена перечитывается, когда ползунок замер.
import { useEffect, useRef, useState } from "react";
import { createPortal } from 'react-dom';
import { repairGroupQuote, type RepairScope } from './repairGroupQuote';
import { Loader2, Wrench, X } from "lucide-react";
import { formatQty as fmt } from "@/lib/formatQty";
import { MINE_REPAIR_ALL_SLIDER } from "@/lib/mineV2";
import type { OfficeMine } from "@/server/api/mine-office/mine-office-list";
import type { RepairAllQuote } from "@/server/api/mine-office/mine-office-repair-all";
import type { RepairCost } from "@/server/api/mine-office/repair-all-plan";
import { Resource } from "../mine-buildings/Art";
import { tr, type Kind, type Lang } from "../mine-buildings/presentation";
import { useOfficeRepairAll, useOfficeRepairAllQuote } from "./useMineOffice";
import { anyToRepair } from "./repairAllReady";

const DEBOUNCE_MS = 250;

/** Значение ползунка, замершее на DEBOUNCE_MS. */
function useSettled(value: number | null): number | null {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value]);
  return settled;
}

function Cost({ cost, l }: { cost: RepairCost; l: Lang }) {
  return (
    <span className="mb-repair-all-cost">
      {Object.entries(cost).map(([k, v]) => (
        <span key={k}>
          <Resource kind={k as Kind} lang={l} />
          <b>{fmt(Number(v))}</b>
        </span>
      ))}
    </span>
  );
}

/** Шаг 2: что именно спишется; только «Подтвердить» чинит. */
export function ConfirmStep({
  l,
  quote,
  onBack,
  onDone,
}: {
  l: Lang;
  quote: RepairAllQuote;
  onBack: () => void;
  onDone: () => void;
}) {
  const run = useOfficeRepairAll(onDone);
  return (
    <>
      <p>{tr(l, `Будет починено шахт: ${quote.mines.length}`, `Mines to repair: ${quote.mines.length}`)}</p>
      <p className="mb-repair-all-short">
        {tr(l, "Спишется", "Will be spent")} <Cost cost={quote.total} l={l} />
      </p>
      <div className="mb-repair-all-actions">
        <button type="button" className="mb-outline" disabled={run.isPending} onClick={onBack}>
          {tr(l, "Отмена", "Cancel")}
        </button>
        <button
          type="button"
          className="mb-gold"
          disabled={run.isPending}
          onClick={() => run.mutate({ cells: quote.cells, below: quote.below })}
        >
          {run.isPending ? <Loader2 className="mb-spin" size={18} /> : <Wrench size={18} />}
          {tr(l, "Подтвердить", "Confirm")}
        </button>
      </div>
    </>
  );
}

export function RepairAllConfirm({ l, onClose, scope, scopeLabel }: { l: Lang; onClose: () => void; scope?: RepairScope; scopeLabel?: string }) {
  // null — ползунок не трогали: стоит на пороге из первой цены (сохранённом).
  const [pct, setPct] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState<RepairAllQuote | null>(null);
  const settled = useSettled(pct);
  const q = useOfficeRepairAllQuote(touched && settled != null ? settled / 100 : undefined);
  const close = useRef<HTMLButtonElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => close.current?.focus(), [confirm]);
  const data = q.data && scope ? repairGroupQuote(q.data, scope) : q.data;
  const value = pct ?? (data ? Math.round(data.below * 100) : null);
  const n = data?.mines.length ?? 0;
  const short = !!data && Object.keys(data.short).length > 0;
  // Цена ещё не для этого положения ползунка — «Починить» ждёт.
  const stale = (touched && settled !== pct) || q.isFetching || q.isPlaceholderData;
  return (
    <div
      className="mb-dialog-layer" ref={layer}
      onKeyDown={(e) => {
        if (e.key === 'Tab') {
          e.stopPropagation();
          const items = Array.from(layer.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? []);
          const first = items[0], last = items.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        if (confirm) setConfirm(null);
        else onClose();
      }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="mb-repair-all-title" className="mb-message">
        <button ref={close} type="button" className="mb-close" onClick={onClose} aria-label={tr(l, "Закрыть", "Close")}>
          <X />
        </button>
        <h2 id="mb-repair-all-title">{tr(l, "Починить всё", "Repair all")}</h2>
        {scopeLabel && <p className="mb-repair-scope">{scopeLabel}</p>}
        {confirm ? (
          <ConfirmStep l={l} quote={confirm} onBack={() => setConfirm(null)} onDone={onClose} />
        ) : q.isPending || value == null ? (
          q.isError ? (
            <>
              <p>{tr(l, "Не удалось посчитать цену", "Could not get the price")}</p>
              <button type="button" className="mb-outline" onClick={() => void q.refetch()}>
                {tr(l, "Повторить", "Retry")}
              </button>
            </>
          ) : (
            <p role="status">
              <Loader2 className="mb-spin" />
            </p>
          )
        ) : (
          <>
            <label className="mb-repair-all-slider">
              <span>
                {tr(l, "Чинить шахты с прочностью ниже", "Repair mines with durability below")} <b>{value}&nbsp;%</b>
              </span>
              <input
                type="range"
                min={MINE_REPAIR_ALL_SLIDER.min}
                max={MINE_REPAIR_ALL_SLIDER.max}
                step={MINE_REPAIR_ALL_SLIDER.step}
                value={value}
                onChange={(e) => {
                  setTouched(true);
                  setPct(Number(e.target.value));
                }}
              />
            </label>
            <p>{tr(l, "Цена зависит от количества и типа шахт.", "The price depends on the number and type of mines.")}</p>
            {q.isError || !data ? (
              <button type="button" className="mb-outline" onClick={() => void q.refetch()}>
                {tr(l, "Повторить", "Retry")}
              </button>
            ) : n === 0 ? (
              <p className={stale ? "mb-repair-all-stale" : undefined}>{tr(l, "Чинить нечего", "Nothing to repair")}</p>
            ) : (
              <>
                <div className={stale ? "mb-repair-all-stale" : undefined}>
                  <p>{tr(l, `Шахт: ${n}`, `Mines: ${n}`)}</p>
                  <Cost cost={data.total} l={l} />
                  {short && (
                    <p className="mb-danger mb-repair-all-short">
                      {tr(l, "Не хватает", "Not enough")} <Cost cost={data.short} l={l} />
                    </p>
                  )}
                </div>
                <button type="button" className="mb-gold" disabled={short || stale} onClick={() => setConfirm(data)}>
                  <Wrench size={18} />
                  {tr(l, "Починить", "Repair")}
                </button>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** Кнопка подвала + окно выбора и подтверждения. */
export function RepairAll({ l, mines, now, scopeLabel }: { l: Lang; mines: readonly OfficeMine[]; now: number; scopeLabel?: string }) {
  const [open, setOpen] = useState(false), [scope, setScope] = useState<RepairScope>();
  const trigger = useRef<HTMLButtonElement>(null);
  const host = trigger.current?.closest('.mine-buildings');
  function close() { setOpen(false); trigger.current?.focus(); }
  return (
    <>
      <button ref={trigger} type="button" className="mb-outline" disabled={!anyToRepair(mines, now)} onClick={() => {
        setScope(scopeLabel ? mines.map(({mapId,q,r})=>({mapId,q,r})) : undefined);
        setOpen(true);
      }}>
        {!scopeLabel && <Wrench size={22} />}
        <span>{tr(l, "Починить всё", "Repair all")}</span>
      </button>
      {open && host && createPortal(<RepairAllConfirm l={l} scope={scope} scopeLabel={scopeLabel} onClose={close} />, host)}
    </>
  );
}
