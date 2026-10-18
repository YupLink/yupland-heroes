// Живая надбавка замедления: сколько СЕЙЧАС стоит лишнего каждый шаг.
//
// Раньше экран брал `slowExtra` из ответа сервера — голое число, снятое в момент
// запроса. Кэш состояния рейда не перезапрашивается по таймеру и вдобавок
// переживает перезагрузку страницы, поэтому надбавка застревала: значок над
// героем уже погас (BetaEffectHud тикает раз в секунду и сам сверяется с
// expiresAt), а кружки цены на клетках, метка маршрута и кнопка посадки всё
// ещё накидывали сверху — до первого действия игрока. Показано одно, списано
// другое; игрок такое замечает даже когда ошибка в его пользу.
//
// Считаем из того же источника, что и значок: effects.slow со сроком годности.
// Замедлений бывает несколько (по одному на кошелёк-сестру), поэтому считаем по
// СПИСКУ и по тому же правилу, что и сервер (encounter-effects.slowExtraOf):
// берём сильнейшее из ещё живых. Пока строк не было, одного числа не хватало —
// на истечении сильного эффекта надбавка падала в ноль, а сервер продолжал
// брать по слабому.
import { useEffect, useState } from "react";

export type SlowRow = { value: number; expiresAt: string };

export type SlowEffect = { value: number; expiresAt: string; rows?: SlowRow[] } | null | undefined;

/**
 * Живые строки замедления. Старый ответ сервера (кэш переживает перезагрузку)
 * списка не знает — тогда это одна строка, ровно как раньше.
 */
function slowRows(slow: SlowEffect): SlowRow[] {
  if (!slow) return [];
  const list = Array.isArray(slow.rows) && slow.rows.length > 0 ? slow.rows : [slow];
  return list
    .map((r) => ({ value: Math.max(0, Number(r.value) || 0), expiresAt: String(r.expiresAt) }))
    .filter((r) => r.value > 0 && Number.isFinite(Date.parse(r.expiresAt)));
}

export function useSlowExtra(slow: SlowEffect): number {
  // Часы стартуют только на клиенте: на SSR время расходится и ломает гидрацию.
  const [now, setNow] = useState(0);
  const rows = slowRows(slow);
  // Ключ эффекта — сами сроки: пока они те же, будильник не переставляем.
  const marks = rows
    .map((r) => Date.parse(r.expiresAt))
    .sort((a, b) => a - b)
    .join(",");

  // Будильники ровно на моменты истечения, а не тик раз в секунду: экран рейда —
  // корень тяжёлой карты, и его посекундный ререндер тянул бы за собой лишний
  // кадр канваса даже тогда, когда на игроке вообще ничего не висит. Значку
  // эффекта секундный тик нужен (он рисует обратный отсчёт), надбавке — нет:
  // между истечениями она не меняется. Цепочка, а не один таймер: на каждом
  // сроке надбавка не обязана обнуляться — она может ПАДАТЬ до следующей по силе.
  useEffect(() => {
    const times = marks ? marks.split(",").map(Number) : [];
    let id: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const next = times.find((x) => x > t);
      if (next !== undefined) id = setTimeout(tick, next - t + 100);
    };
    tick();
    return () => {
      if (id !== undefined) clearTimeout(id);
    };
  }, [marks]);

  if (rows.length === 0) return 0;
  // До первого кадра на клиенте верим серверу: он отдал эффект, отфильтровав по
  // expires_at. Ошибиться здесь безопаснее в бо́льшую сторону — лучше показать
  // лишнее, чем занизить цену и списать больше показанного.
  if (now === 0) return Math.max(0, Number(slow?.value) || 0);
  let extra = 0;
  for (const r of rows) {
    if (Date.parse(r.expiresAt) <= now) continue;
    if (r.value > extra) extra = r.value;
  }
  return extra;
}
