// Незавершённые операции ввода: журнал знает то, чего не видно в истории.
//
// Скан истории склада ограничен 200 записями Sendler и окном давности. Журнал
// же прямо называет операции, которые НАЧАЛИСЬ и не дошли до выдачи — их и
// добиваем адресно, каждым прогоном крона. Пока таблицы журнала нет, функция
// молча возвращает нули (journalUnfinished сам проверяет её наличие).
//
// ⚠️ ЖУРНАЛ — ПОВОД, А НЕ ОСНОВАНИЕ. С тех пор как строка заводится ДО проверки
// перевода (иначе провалы проверки в журнал вовсе не попадали), в ней лежит то,
// что прислал КЛИЕНТ: контракт, токен и хэш. Выдавать по такой строке нельзя —
// иначе любой игрок, назвав чужой токен, получал бы за него награду: выдача
// (nft-input-deliver) отправляет награду тому, кто записан в кандидате, и
// происхождение кандидата не перепроверяет.
//
// Поэтому из журнала мы берём ТОЛЬКО кошельки, а что они присылали на склад,
// разбираем заново по их личной истории в Sendler: отправитель там приходит из
// индекса, а не из запроса. Тот же приём — в nft-input-selfheal.
import { journalUnfinished } from "./nft-input-journal-read";
import { recoverCandidates } from "./nft-input-recover";
import { scanWalletOutgoing, type InputCandidate } from "./nft-input-scan";

/** Потолок кошельков за прогон: каждый — отдельный запрос в Sendler. */
const MAX_WALLETS = 20;

export async function runUnfinishedInputRecovery(): Promise<{
  scanned: number;
  granted: number;
  packs: number;
  chips: number;
  failed: number;
}> {
  const stuck = await journalUnfinished({ minAgeMin: 5, maxAgeDays: 30, limit: 50 });
  if (stuck.length === 0) return { scanned: 0, granted: 0, packs: 0, chips: 0, failed: 0 };

  const wallets = [...new Set(stuck.map((o) => o.wallet))].slice(0, MAX_WALLETS);
  const list: InputCandidate[] = [];
  for (const wallet of wallets) {
    // includeFresh: незавершённая операция и так старше пяти минут, прятать от
    // себя свежие переводы тут незачем. Окно давности — общее, 30 дней, ровно
    // как у выборки из журнала.
    const found = await scanWalletOutgoing(wallet, { includeFresh: true }).catch(() => []);
    list.push(...found);
  }
  if (list.length === 0)
    return { scanned: stuck.length, granted: 0, packs: 0, chips: 0, failed: 0 };

  const { summary } = await recoverCandidates(list, { max: 50 });
  if (summary.granted > 0) {
    console.log(
      `[nft-input-stuck] добито ${summary.granted} незавершённых ` +
        `(паков ${summary.packs}, фишек ${summary.chips}) по ${wallets.length} кошелькам`,
    );
  }
  return {
    scanned: stuck.length,
    granted: summary.granted,
    packs: summary.packs,
    chips: summary.chips,
    failed: summary.failed,
  };
}
