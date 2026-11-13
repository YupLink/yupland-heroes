// Строка ресурсов внизу карты рейда: энергия и лайки одной колонкой, дальше
// дерево, камень, золото и кристаллы. Полупрозрачная подкладка, чтобы не
// сливалось с картой.
//
// Плотность здесь важнее красоты: полоса живёт поверх карты, и каждый лишний
// пиксель отъедает игровое поле. Энергия с лайками стоят одна над другой —
// это вдвое короче по ширине и освобождает место остальным.
import { memo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { myLikeBalance } from "@/api";
import { energyTrend, useEnergy } from "@/lib/hooks/useEnergy";
import { useResources } from "@/lib/hooks/useResources";
import { useT } from "@/lib/i18n";
import { useCastleMode } from "./castleMode";
import type { TFn } from "./effectMeta";
import { lineWidth, useBarWidth } from "./resourceBarFit";

export type ResourceBarProps = {
  energy: number;
  isAdmin?: boolean;
};

/** Суффиксы «тысяч»/«миллионов» на языке игрока: «к/М» или «k/M». Из словаря. */
type ShortSuffix = { k: string; m: string };
const SUFFIX_RU: ShortSuffix = { k: "к", m: "М" };
const shortSuffix = (t: TFn): ShortSuffix => ({
  k: t("braid.short_thousand"),
  m: t("braid.short_million"),
});

/**
 * Короткая запись числа: 10 500 → «10.5к», 1 240 000 → «1.24М».
 *
 * Без неё пятизначные суммы разносят полосу по ширине, и ресурсы «плывут» —
 * при 10к+ сразу у нескольких на телефоне не помещалась и половина.
 *
 * Суффикс — на языке игрока (по умолчанию русский, как было): английский игрок
 * видел «10.5к» посреди своего интерфейса.
 */
export function shortAmount(n: number, decimals = 0, sfx: ShortSuffix = SUFFIX_RU): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  // До десяти тысяч — как есть. У энергии при этом сотые важны: шаг стоит
  // 2.61, и «4» вместо 4.21 не даёт понять, хватит ли на ход. У лайков дробей
  // не бывает вовсе.
  // Порог был 10 000, и пятизначные суммы всё равно разносили полосу: игроки
  // жаловались, что перегородки между ресурсами разъезжаются. Считаем от
  // ТЫСЯЧИ: 1000 → «1к», 2288 → «2.3к». Точное значение остаётся в подсказке.
  if (abs < 1000) return decimals > 0 ? v.toFixed(decimals) : String(Math.floor(v));
  if (abs < 999_500) {
    const k = v / 1000;
    return `${abs < 100_000 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}${sfx.k}`;
  }
  const m = v / 1_000_000;
  return `${Math.abs(m) < 100 ? m.toFixed(2).replace(/\.?0+$/, "") : Math.round(m)}${sfx.m}`;
}

/** «1:37» — сколько ждать следующую единицу энергии. */
function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Один ресурс: иконка и число.
 *
 * `?v=2` в адресе — чтобы обновились у тех, у кого в кэше лежит прежняя
 * версия: у неё в палитре потерялась прозрачность, и вокруг рисунка был
 * серый квадрат. Файл раздаётся с длинным кэшем, сам он не обновится.
 */
function Res({
  src,
  value,
  decimals = 0,
  compactAt,
  onClick,
}: {
  src: string;
  value: number;
  decimals?: number;
  compactAt?: number;
  onClick?: () => void;
}) {
  const sfx = shortSuffix(useT());
  const inner = (
    <>
      <img src={src} alt="" className="h-4 w-4 shrink-0" loading="lazy" decoding="async" />
      <span className="text-[11px] font-bold leading-none tabular-nums">
        {compactAt && Math.abs(value) < compactAt ? String(Math.trunc(value)) : shortAmount(value, decimals, sfx)}
      </span>
    </>
  );
  if (!onClick) {
    return (
      <div className="flex items-center gap-0.5" title={String(value)}>
        {inner}
      </div>
    );
  }
  // Кнопка возвращает себе нажатия: сама полоса их не ловит (pointer-events-none),
  // чтобы не перехватывать тапы по карте под ней.
  return (
    <button
      type="button"
      onClick={onClick}
      className="pointer-events-auto flex items-center gap-0.5"
      title={String(value)}
    >
      {inner}
    </button>
  );
}

function ResourceBar({ energy }: ResourceBarProps) {
  const t = useT();
  const castleMode = useCastleMode();
  const likesQ = useQuery({
    queryKey: ["my-like-balance"],
    queryFn: () => myLikeBalance(),
    staleTime: 30_000,
  });
  const likes = likesQ.data?.available ?? 0;

  // Таймер восстановления. В полноэкранном шапки нет, а знать, когда придёт
  // следующая единица, нужно — иначе непонятно, ждать ход или уходить.
  // Держим свёрнутым и раскрываем тапом по энергии: постоянная плашка над
  // картой отъедала бы место, ради которого полный экран и включают.
  const energyQ = useEnergy();
  const [showTimer, setShowTimer] = useState(false);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    setLeft(energyQ.data?.nextRegenSec ?? 0);
  }, [energyQ.data?.nextRegenSec]);
  useEffect(() => {
    // Тикаем сами: запрос обновляется раз в пятнадцать секунд, а обратный
    // отсчёт обязан идти каждую, иначе выглядит зависшим.
    if (!showTimer) return;
    const id = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [showTimer]);

  // Добываемые ресурсы: живут на account_id (account_resources), их пополняет
  // сбор с шахт. Клейм инвалидирует RESOURCES_KEY — цифры обновляются без F5.
  const resQ = useResources();
  const res = resQ.data;

  const max = energyQ.data?.maxEnergy ?? 0;
  // Выше лимита запас тает (acc-45): таймер тот же, подпись «−1 через …».
  const trend =
    max > 0 && energyQ.data
      ? energyTrend({ energy, maxEnergy: max, nextRegenSec: energyQ.data.nextRegenSec })
      : "regen";

  // В линию, пока помещается. Полоса теперь во всю ширину, и держать энергию с
  // лайками столбиком незачем — но у игрока с миллионами лайков и десятками
  // тысяч дерева ряд снова не влезает, и тогда эта пара складывается обратно.
  const { ref, width } = useBarWidth();
  const sfx = shortSuffix(t);
  const labels = [
    ...(!castleMode ? [shortAmount(energy, 2, sfx)] : []),
    shortAmount(likes, 0, sfx),
    shortAmount(res?.wood ?? 0, 0, sfx),
    shortAmount(res?.stone ?? 0, 0, sfx),
    ...(!castleMode ? [shortAmount(res?.gold ?? 0, 0, sfx)] : []),
    shortAmount(res?.diamonds ?? 0, 0, sfx),
  ];
  // Мерим ПОЛОСУ ЦЕЛИКОМ (она во всю ширину карты), а не саму плашку: на
  // широком экране плашка растёт по содержимому, и её ширина всегда «ровно
  // столько, сколько заняли» — сравнивать с ней бессмысленно.
  //
  // Ширину знаем не сразу (первый кадр до замера) — до неё считаем, что место
  // есть: развернуть полосу на кадр позже мягче, чем моргнуть стопкой.
  const inline = width === 0 || lineWidth(labels) <= width - 16;

  // Самая нижняя полоса карты. На телефоне ресурсы стояли НАД кнопками героя и
  // полноэкранки, и ряд читался вверх ногами: сначала цифры, потом органы
  // управления. Теперь цифры внизу, кнопки над ними.
  // На телефоне полоса идёт от края до края: островок посреди карты выглядел
  // как отдельное окошко, отрезающее кусок поля. На широком экране он уместен —
  // тянуть строчку цифр через весь монитор незачем, поэтому с sm плашка снова
  // по содержимому и с отступом снизу.
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-1 sm:bottom-2 sm:px-2"
    >
      {showTimer && !castleMode && (
        <div className="rounded-lg border border-white/10 bg-black/80 px-2 py-1 text-[11px] font-semibold tabular-nums text-white/85 backdrop-blur-sm">
          {trend === "flat"
            ? t("braid.energy_full")
            : t(trend === "decay" ? "braid.energy_decay_next" : "braid.energy_next", {
                time: clock(left),
                max,
              })}
        </div>
      )}
      <div className={castleMode ? "raid-resource-bar__surface" : "flex w-full max-w-full items-center justify-center gap-1.5 border-x-0 border-b-0 border-t border-white/10 bg-black/70 px-2 py-1 backdrop-blur-sm sm:w-auto sm:rounded-xl sm:border"}>
        {castleMode ? (
          <>
            <Res src="/resources/likes.webp" value={likes} compactAt={10_000} />
            <Res src="/resources/wood.webp" value={res?.wood ?? 0} compactAt={10_000} />
            <Res src="/resources/stone.webp" value={res?.stone ?? 0} compactAt={10_000} />
            <Res src="/resources/crystal.webp" value={res?.diamonds ?? 0} compactAt={10_000} />
          </>
        ) : (
          <>
            <div className={inline ? "flex items-center gap-1.5" : "flex flex-col gap-0.5"}>
              <Res src="/resources/energy.webp" value={energy} decimals={2} onClick={() => setShowTimer((v) => !v)} />
              <Res src="/resources/likes.webp" value={likes} />
            </div>
            <div className="h-6 w-px shrink-0 bg-white/20" />
            <div className="flex items-center gap-1.5">
              <Res src="/resources/wood.webp" value={res?.wood ?? 0} />
              <Res src="/resources/stone.webp" value={res?.stone ?? 0} />
              <Res src="/resources/gold.webp" value={res?.gold ?? 0} />
              <Res src="/resources/crystal.webp" value={res?.diamonds ?? 0} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const BetaRaidResourceBar = memo(ResourceBar);

