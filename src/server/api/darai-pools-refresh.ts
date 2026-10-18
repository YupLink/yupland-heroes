// Свежие пополнения пула — сами, без чужой руки.
//
// ПОЧЕМУ ЭТО ПОНАДОБИЛОСЬ. Сканер пополнений (syncCollectionDeposits) писался
// как «повесить в крон», но повесить забыли: его не звал НИКТО — ни крон, ни
// кнопка. Три записи в пуле появились от разового прогона руками, а следующие
// 400 млн, отправленные с кошелька коллекции, просто не были учтены. На экране
// это выглядело как перерасход −7,7 млн при живых деньгах на складе.
//
// Теперь сканер зовут двое: панель пула (админ открыл — увидел правду) и
// получасовой крон (пул свежий и без открытой панели). Оба — через эту обёртку.
//
// Ошибку наружу НЕ выпускаем: сканер ходит в Sendler, а внешний сервис не
// должен ронять экран, где показаны все остальные числа.
import { syncCollectionDeposits } from "./darai-pools-sync";

/** Чаще этого в Sendler не ходим: пополнения приходят раз в дни, не в секунды. */
const COOLDOWN_MS = 5 * 60_000;

let lastAt = 0;
let running: Promise<void> | null = null;
/** Пополнения казны в отстое на последнем прогоне — ещё не пул, но уже на кошельке. */
let lastUnsettled = 0;
export const unsettledDeposits = (): number => lastUnsettled;

/**
 * Подтянуть новые пополнения, если давно не подтягивали.
 *
 * `force` — для кнопки и крона: они просят именно свежие данные, а не «что
 * успело накопиться».
 */
export async function refreshPoolDeposits(force = false): Promise<void> {
  if (!force && Date.now() - lastAt < COOLDOWN_MS) return;
  // Один поход на всех: панель открыта у нескольких вкладок сразу — второй
  // запрос к Sendler в ту же секунду не нужен никому.
  if (running) return running;
  lastAt = Date.now();
  running = syncCollectionDeposits()
    .then((r) => {
      lastUnsettled = r.unsettled;
      if (r.added > 0) {
        console.log(`[darai-pool] новых пополнений: ${r.added}, всего внесено ${r.total}`);
      }
    })
    .catch((e) => {
      console.warn("[darai-pool] пополнения не подтянулись:", (e as Error).message);
    })
    .finally(() => {
      running = null;
    });
  return running;
}
