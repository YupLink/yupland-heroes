// «Деньги придут через минуту» — то, что игрок видит вместо отказа.
//
// Раньше на этом месте была ошибка: проверка начиналась в момент подписи,
// когда индексер транзакцию ещё не видит, и честно не находила её. Игрок читал
// «транзакция не найдена» над только что ушедшими деньгами и шёл искать хэш.
//
// Обратный отсчёт здесь не украшение: он превращает ожидание в понятное
// «осталось столько-то» вместо молчащего колеса.
import { useEffect, useRef, useState } from "react";
import { Clock, Loader2 } from "lucide-react";

export function TopUpWaiting({
  amount,
  symbol,
  waitSec,
  startedAt,
  onDue,
}: {
  amount: number;
  symbol: string;
  waitSec: number;
  /** Момент подписи. Переживает перезагрузку — отсчёт продолжается, а не начинается. */
  startedAt: number;
  onDue: () => void;
}) {
  const [left, setLeft] = useState(() =>
    Math.max(0, waitSec - Math.floor((Date.now() - startedAt) / 1000)),
  );

  // Проверку зовём РОВНО ОДИН раз. Тик идёт каждую секунду, и без замка на
  // нуле он звал бы её ежесекундно — то есть ровно тот шквал запросов, ради
  // избавления от которого всё и делалось.
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
  }, [startedAt]);

  useEffect(() => {
    const tick = () => {
      const rest = Math.max(0, waitSec - Math.floor((Date.now() - startedAt) / 1000));
      setLeft(rest);
      if (rest === 0 && !fired.current) {
        fired.current = true;
        onDue();
        clearInterval(id);
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [waitSec, startedAt, onDue]);

  return (
    <div className="space-y-1.5 rounded-lg border border-gold/40 bg-gold/5 p-3">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-gold">
        {left > 0 ? <Clock className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {left > 0 ? `Зачислим через ${left} сек` : "Проверяем перевод…"}
      </div>
      <div className="text-[11px] text-muted-foreground">
        {amount.toLocaleString("ru-RU")} {symbol} уже ушли. Делать ничего не нужно — можно закрыть
        окно, зачисление придёт само.
      </div>
    </div>
  );
}
