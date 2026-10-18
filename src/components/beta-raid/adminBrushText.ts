// Тексты режима бога на двух языках.
//
// Панель кисти исторически русская, но эти сообщения говорят о СУДЬБЕ правок
// («не уехало», «ждёт на карте») — их нельзя показать только половине админов.
// Держим рядом с кистью, а не в общем словаре: строки живут ровно здесь.
import type { Lang } from "@/lib/store";

export type BrushText = ReturnType<typeof brushText>;

export function brushText(lang: Lang) {
  const ru = lang !== "en";
  return {
    /** Сколько клеток уехало на сервер. */
    published: (n: number) => (ru ? `Выгружено клеток: ${n}` : `Cells uploaded: ${n}`),
    /** Сервер пропустил клетки без местности — они остались в очереди. */
    skipped: (cells: string[]) => {
      // Пропущенных бывает и полсотни: в подпись лезет первый десяток, а
      // остальные остаются числом — иначе всплывашка закроет собой карту.
      const head = cells.slice(0, 10).join(" · ");
      const tail = cells.length > 10 ? ` +${cells.length - 10}` : "";
      return ru
        ? `Без местности, не уехало (${cells.length}): ${head}${tail} — остались в очереди`
        : `No terrain, not saved (${cells.length}): ${head}${tail} — kept in the queue`;
    },
    /** Клетка уже в пакете, который летит на сервер: отменять поздно. */
    inFlight: ru
      ? "Клетка уже уехала на сервер — дождись ответа"
      : "This cell is already on its way — wait for the reply",
    /**
     * Черновик поднялся из localStorage после перезагрузки И ПЕРЕЖИЛ проверку
     * карты. Раньше говорилось раньше времени: «восстановлено 12 правок», а
     * следом — «черновик отброшен». Теперь об этом объявляет тот же
     * verifyDraft, что решает его судьбу, и обе надписи не спорят.
     */
    restored: (n: number) =>
      ru ? `Восстановлено невыгруженных правок: ${n}` : `Unsaved edits restored: ${n}`,
    /** Уход с экрана: правки не пропали, но и не сохранены. */
    leftPending: (n: number) =>
      ru
        ? `Не выгружено правок: ${n} — ждут на карте`
        : `${n} edits are still unsaved — waiting on the map`,
    /** Карта из localStorage несёт мазки, которых нет в черновике. */
    staleMap: ru
      ? "В сохранённой карте были чужие невыгруженные правки — перечитали с сервера"
      : "The saved map carried unsaved edits — reloaded from the server",
    /** Черновик остался от другой активной карты рейда — восстанавливать нечего. */
    otherMap: ru
      ? "Черновик снят с другой карты рейда — невыгруженные правки отброшены"
      : "The draft was taken on another raid map — its unsaved edits are discarded",

    /** Остаток игрового пула Darai — полоска над картой, только админу. */
    pool: {
      title: ru ? "Пул карты" : "Map pool",
      /** Заложили больше, чем внесла коллекция: число красное. */
      short: ru ? "перерасход" : "overdrawn",
      failed: ru ? "пул не прочитан" : "pool unavailable",
      /** Строки расшифровки: тап по плашке разворачивает весь путь денег. */
      deposited: ru ? "Внесла коллекция" : "Deposited by collection",
      promised: ru ? "Пообещано за всё время" : "Pledged all-time",
      onMap: ru ? "Сейчас стоит на карте" : "Standing on the map now",
      paidOut: ru ? "Унесли игроки" : "Taken by players",
    },
  };
}
