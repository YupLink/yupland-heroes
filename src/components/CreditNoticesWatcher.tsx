// Глобальный сторож зачислений: показать «пришло» на ЛЮБОМ экране.
//
// Зачем в корне. Тост показывает useCreditNotices, но раньше он жил только в
// форме пополнения и модалке ввода NFT. Игрок, закрывший окно и вернувшийся на
// главную (а не в ту же форму), денег дожидался — их доводит крон, — но
// обещанного «зачислено N на счёт» не видел никогда: показать было некому.
//
// Здесь хук смонтирован один раз на всё приложение. Опрос дешёвый и не
// периодический: один заход при входе, и — только если есть незакрытые
// ожидания — ещё пара после обещанной минуты. Без сессии сервер отдаёт пусто.
import { useEffect, useRef } from "react";
import { useCreditNotices } from "@/lib/hooks/useCreditNotices";

/** После входа проверяем ещё раз к концу обещанной минуты и разок следом. */
const FOLLOWUP_MS = [65_000, 100_000];

export function CreditNoticesWatcher() {
  // autoPollOnMount:false — первый заход делаем сами, чтобы узнать `waiting` и
  // решить про отложенные. Без флага хук опрашивал бы вход дважды.
  const { poll, pollLater } = useCreditNotices({ autoPollOnMount: false });

  const armed = useRef(false);
  useEffect(() => {
    if (armed.current) return;
    armed.current = true;
    void poll().then((res) => {
      // Отложенные заходы ставим ТОЛЬКО когда есть чего ждать — иначе это был
      // бы лишний опрос на каждый вход, ровно та нагрузка, что мы снимаем.
      if (res.waiting > 0) FOLLOWUP_MS.forEach((ms) => pollLater(ms));
    });
  }, [poll, pollLater]);

  return null;
}
