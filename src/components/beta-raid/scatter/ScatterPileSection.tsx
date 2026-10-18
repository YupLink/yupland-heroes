// Раздел кучек — общий для сундуков и монеток: у них одинаковые настройки,
// разные только подписи и то, что стоит на карте.
//
// Полей три: фонд, количество и среднее значение. Количество можно НЕ задавать:
// пустое поле значит «посчитай сам» — от фонда и от среднего значения, а без
// него по старому правилу «кучка на 10 000». Об этом честно написано под
// полями, иначе пустое поле читается как ноль и раздача молча ничего не делает.
import { autoPileCount, pileCountByPoint } from "@/lib/raid/scatterMath";
import { FieldLabel, NumBox } from "./ScatterFields";
import { fmtNum } from "./scatterFormat";
import { ScatterLandPicker } from "./ScatterLandPicker";
import { ScatterSection } from "./ScatterSection";
import { ScatterFundList } from "./ScatterFundList";
import { ScatterTemplatePicker } from "./ScatterTemplatePicker";
import {
  amountOf,
  intOf,
  MAX_PER_GROUP,
  overCap,
  PILE_FUND_STEP,
  type PileDraft,
} from "./scatterDraft";

/**
 * Прикидка «сколько выйдет само» — тем же счётом, что у сервера
 * (autoPileCount), чтобы подпись и результат не разошлись на единицу. Потолок
 * группы сервер применяет тоже, поэтому и здесь показываем УЖЕ обрезанное
 * число, а `capped` говорит, что обрезка случилась: «≈ 5 000» на фонде в
 * миллиард без объяснения выглядит как поломка счёта.
 *
 * Считаем ТОЛЬКО когда фонд один: складывать лайки с USDT в одно число нельзя,
 * а показывать сумму разного — врать. Точную цифру всё равно даёт предпросмотр.
 */
function guess(d: PileDraft): { n: number; capped: boolean } | null {
  const live = d.funds.filter((f) => amountOf(f.amount) > 0);
  if (live.length !== 1) return null;
  const fund = amountOf(live[0].amount);
  const point = amountOf(d.point);
  const want =
    point > 0
      ? pileCountByPoint(fund, point, Number.POSITIVE_INFINITY)
      : autoPileCount(fund, Number.POSITIVE_INFINITY);
  return { n: Math.min(want, MAX_PER_GROUP), capped: want > MAX_PER_GROUP };
}

function summary(d: PileDraft): string {
  const auto = d.count.trim() === "";
  const n = auto ? (guess(d)?.n ?? null) : intOf(d.count, 0, 100_000);
  const head = auto
    ? n === null
      ? "по фонду"
      : `по фонду ≈ ${fmtNum(n)}`
    : `${fmtNum(n ?? 0)} шт`;
  const point = amountOf(d.point);
  const extra = [
    point > 0 ? `по ${fmtNum(point, 6)}` : null,
    d.funds.length > 0 ? `фонды: ${d.funds.length}` : null,
    d.templateIds.length > 0 ? `шаблоны: ${d.templateIds.length}` : null,
  ].filter(Boolean);
  return [head, ...extra].join(" · ");
}

export function ScatterPileSection({
  title,
  pile,
  value,
  onChange,
  tokens,
  removeHint,
  pickerTitle,
}: {
  title: string;
  /** Что раскладываем: от этого зависит, какие шаблоны показывает выбор. */
  /** Какие шаблоны показывать в пикере: «any» — оба вида, раздел один на них. */
  pile: "chest" | "coin" | "any";
  value: PileDraft;
  onChange: (next: PileDraft) => void;
  tokens: string[];
  removeHint: string;
  pickerTitle: string;
}) {
  const patch = (next: Partial<PileDraft>) => onChange({ ...value, ...next });
  const auto = value.count.trim() === "";
  const hasPoint = amountOf(value.point) > 0;
  const g = guess(value);

  return (
    <ScatterSection
      title={title}
      summary={summary(value)}
      enabled={value.enabled}
      onEnabled={(enabled) => patch({ enabled })}
      removeKilled={value.removeKilled}
      onRemoveKilled={(removeKilled) => patch({ removeKilled })}
      removeHint={removeHint}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <FieldLabel>Сколько кучек</FieldLabel>
            <NumBox value={value.count} onChange={(count) => patch({ count })} placeholder="авто" />
          </label>
          <label className="flex flex-col gap-1">
            <FieldLabel>Среднее значение</FieldLabel>
            <NumBox value={value.point} onChange={(point) => patch({ point })} placeholder="авто" />
          </label>
        </div>
        <p className="text-[10px] leading-tight text-muted-foreground">
          {/* Потолок называем вслух: сервер режет и набранное руками, и
              посчитанное от фонда, а молчаливая подмена «200000 → 5000»
              выглядела бы как потерянная настройка. */}
          {(overCap(value.count) || (auto && g?.capped)) && (
            <b className="mr-1 block font-semibold text-amber-400">
              максимум {fmtNum(MAX_PER_GROUP)} за раз
            </b>
          )}
          {/* Название поля обманчиво: это не среднее арифметическое, а точка
              знаменателя. Говорим прямо, что именно оно задаёт. */}
          Среднее значение — середина разброса одной кучки: от половины до двойного.{" "}
          {hasPoint
            ? "Количество пусто — посчитаем сами по фонду и ему"
            : `Количество пусто — посчитаем сами: одна кучка на ${fmtNum(PILE_FUND_STEP)} фонда`}
          {auto && g !== null && (
            <>
              {" · "}
              <b className="text-gold">≈ {fmtNum(g.n)}</b>
            </>
          )}
        </p>
      </div>

      <ScatterFundList funds={value.funds} onChange={(funds) => patch({ funds })} tokens={tokens} />

      <div className="space-y-1">
        <FieldLabel>Чем ставить</FieldLabel>
        <ScatterTemplatePicker
          kind="chest"
          pile={pile === "any" ? undefined : pile}
          title={pickerTitle}
          value={value.templateIds}
          onChange={(templateIds) => patch({ templateIds })}
        />
      </div>

      <ScatterLandPicker lands={value.lands} onLands={(lands) => patch({ lands })} />
    </ScatterSection>
  );
}
