// Списки окна «Добыча»: шахты и поля. Одна карточка — один объект на карте.
//
// Числа считаем ровно теми же формулами, что и сервер: у шахт добыча капает
// целыми часами (livePendingAmount), у полей — доля поля, делённая на число
// работников. Иначе подпись разъедется со списанным, как это уже было с ценой
// схода на берег.
import { HandCoins, Sprout } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatQty } from "@/lib/formatQty";
import { lostMarkKey, mineRowReady } from "@/lib/mineLost";
import { mineBrokenNow, type MineClockStamps } from "@/lib/mineV2Clock";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";
import type { HarvestField } from "@/server/api/beta-raid/harvest-fields";
import { MineLeftLine, MineModeSwitch } from "./MineModeSwitch";
import { useMineListNow } from "./useMineListNow";

/** Ресурсы знаем по имени, монеты показываем под их символом. */
const KNOWN = new Set([
  "likes",
  "tickets",
  "energy",
  "gold",
  "stone",
  "diamonds",
  "wood",
  "custom",
]);

/** Красивое число — общее правило с окном склада (@/lib/formatQty). */
export const num = formatQty;

/** Координата клетки как кнопка: тап везёт камеру и подсвечивает клетку. */
export function CellLink({
  q,
  r,
  onShow,
}: {
  q: number;
  r: number;
  onShow?: (q: number, r: number) => void;
}) {
  const t = useT();
  const label = t("harvest.cell", { q, r });
  if (!onShow) return <>{label}</>;
  return (
    <button
      type="button"
      onClick={() => onShow(q, r)}
      className="underline decoration-dotted underline-offset-2 hover:text-foreground"
    >
      {label}
    </button>
  );
}

/** Клетка своего этажа — кнопкой; другого — подписью с его названием. */
function PlaceLink({
  q,
  r,
  floor,
  onShow,
}: {
  q: number;
  r: number;
  floor?: string | null;
  onShow?: (q: number, r: number) => void;
}) {
  if (!floor) return <CellLink q={q} r={r} onShow={onShow} />;
  return (
    <>
      {floor} · <CellLink q={q} r={r} />
    </>
  );
}

export function MineList({
  mines,
  onShowCell,
  clock,
}: {
  mines: MineRow[];
  onShowCell?: (q: number, r: number) => void;
  /** Метки часов ответа «Добычи»: срок шахт v2 — по часам сервера. */
  clock?: MineClockStamps;
}) {
  const t = useT();
  const now = useMineListNow(clock, mines);
  const label = (key: string) => (KNOWN.has(key) ? t(`mine.res.${key}`) : key);
  if (mines.length === 0) {
    return <p className="text-center text-[11px] text-muted-foreground">{t("harvest.no_mines")}</p>;
  }
  return (
    <div className="space-y-1.5">
      {mines.map((m) => {
        const name = m.resource === "token" ? (m.token ?? "token") : m.resource;
        // Отнятая (§8.71) — сумма её строки журнала, выхода в час нет.
        const ready = mineRowReady(m);
        // Режим меняют у своей работающей v2; остров — только «Бережно».
        const v2 = m.v2;
        const switchable = !m.island && !!v2 && !mineBrokenNow(v2, now);
        return (
          <div
            key={m.lost ? m.lost.id : `${m.mapId}:${m.q},${m.r}`}
            className="rounded-xl border border-border px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold">
                  <HandCoins className="h-3.5 w-3.5 text-amber-300" />
                  <span className="truncate">{label(name)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  <PlaceLink q={m.q} r={m.r} floor={m.floor} onShow={onShowCell} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-bold text-amber-300">
                  {/* Отнятая — метка вместо выхода; алмаз острова — выход в сутки. */}
                  {m.lost
                    ? t(lostMarkKey(m.lost.kind))
                    : m.stepHours === 24
                      ? t("mine2.per_day", { n: num(m.yield * 24) })
                      : t("harvest.per_hour", { n: num(m.yield) })}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {ready > 0 ? t("harvest.ready", { n: num(ready) }) : t("harvest.nothing_ready")}
                </div>
                {v2 && <MineLeftLine v2={v2} now={now} />}
              </div>
            </div>
            {v2 && switchable && <MineModeSwitch row={m} v2={v2} clock={clock} />}
          </div>
        );
      })}
    </div>
  );
}

export function FieldList({
  fields,
  onShowCell,
}: {
  fields: HarvestField[];
  onShowCell?: (q: number, r: number) => void;
}) {
  const t = useT();
  if (fields.length === 0) {
    return (
      <p className="text-center text-[11px] text-muted-foreground">{t("harvest.no_fields")}</p>
    );
  }
  return (
    <div className="space-y-1.5">
      {fields.map((f) => {
        const name =
          f.reward.kind === "item"
            ? f.reward.name
            : f.reward.resource === "token"
              ? (f.reward.token ?? "token")
              : t(`mine.res.${f.reward.resource}`);
        return (
          <div
            key={`${f.mapId}:${f.q},${f.r}`}
            className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Sprout className="h-3.5 w-3.5 text-emerald-300" />
                <span className="truncate">{name}</span>
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                <PlaceLink q={f.q} r={f.r} floor={f.floor} onShow={onShowCell} /> ·{" "}
                {f.heroName ? t("harvest.worker", { name: f.heroName }) : t("harvest.no_worker")}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold text-emerald-300">
                {t("harvest.per_hour", { n: num(f.perHour) })}
              </div>
              {/* Три разных числа вместо одного «зреет 1.33»: что уже моё на
                  полке, что уедет туда ближайшим заходом и что ещё зреет.
                  Дробь остаётся дробью — округление вниз выглядело как «поле
                  не работает», а целые уезжают на склад сами. */}
              {f.ready > 0 && (
                <div className="text-[11px] font-semibold text-emerald-300">
                  {t("harvest.ready", { n: num(f.ready) })}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground">
                {t("harvest.growing", { n: num(f.growing) })}
              </div>
              {f.stored != null && f.storedAt && (
                <div className="text-[11px] text-muted-foreground">
                  {t("harvest.stored_at", { n: num(f.stored) })}{" "}
                  <PlaceLink
                    q={f.storedAt.q}
                    r={f.storedAt.r}
                    floor={f.floor}
                    onShow={onShowCell}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
