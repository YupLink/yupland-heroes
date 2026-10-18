// Ввод, который Sendler ещё не подтвердил: обещание игроку и его отработка.
//
// Договор с игроком — «пак придёт в течение минуты, делать ничего не нужно».
// Держать ради этого соединение нельзя (прокси и телеграм-вебвью рвут долгие
// запросы), поэтому обещание отрабатывается тремя независимыми путями:
//   1. отложенный догон прямо в этом процессе — через 15, 40 и 90 секунд;
//   2. самолечение при следующем обращении игрока (nft-input-selfheal);
//   3. получасовой крон — последний рубеж.
// Хватит любого: все трое сходятся на одной выдаче, а замок квитанции и
// проверка «уже выдано» не дают выдать дважды.
//
// ВАЖНО ПРО ДОВЕРИЕ: догон здесь НЕ верит тому, что прислал клиент. Он берёт
// личную историю кошелька в Sendler и разбирает её сам — отправитель приходит
// из индекса (sender_id), а не из запроса. Поэтому подсказка «этот игрок ждёт»
// не даёт присвоить чужой перевод: она только повод сходить в Sendler раньше.
import { recoverCandidates } from "./nft-input-recover";
import { scanWalletOutgoing } from "./nft-input-scan";

/** Через сколько дожимаем сами. Первый заход — сразу после потолка ожидания. */
const CHASE_DELAYS_MS = [15_000, 40_000, 90_000];
/** Столько кошелёк считается ожидающим: самолечение пропускает его вне очереди. */
const HINT_TTL_MS = 10 * 60_000;
const MAX_TRACKED = 5000;

/** wallet → до какого момента считаем, что игрок ждёт награду. */
const waiting = new Map<string, number>();
/** Чтобы отложенные догоны одного кошелька не наслаивались друг на друга. */
const chasing = new Set<string>();

/** Игрок ждёт: помечаем и заводим отложенный догон. */
export function notePendingInput(wallet: string): void {
  if (waiting.size > MAX_TRACKED) waiting.clear();
  waiting.set(wallet, Date.now() + HINT_TTL_MS);
  scheduleChase(wallet);
}

/** Ждёт ли этот игрок награду за уже отправленную NFT. */
export function hasPendingInput(wallet: string): boolean {
  const until = waiting.get(wallet);
  if (until == null) return false;
  if (until <= Date.now()) {
    waiting.delete(wallet);
    return false;
  }
  return true;
}

export function clearPendingInput(wallet: string): void {
  waiting.delete(wallet);
}

/**
 * Догон по личной истории кошелька. Свежие переводы берём намеренно
 * (includeFresh): обычный скан их прячет, чтобы не обгонять живой ввод, — а
 * здесь живой ввод уже отступил и ждать его нечего.
 *
 * Возвращает, сколько наград выдано.
 */
export async function chasePendingInput(wallet: string): Promise<number> {
  const list = await scanWalletOutgoing(wallet, { includeFresh: true });
  if (list.length === 0) return 0;
  const { summary } = await recoverCandidates(list, { max: 30 });
  if (summary.granted > 0) clearPendingInput(wallet);
  return summary.granted;
}

/** Отложенные попытки: молча, best-effort, по одному расписанию на кошелёк. */
function scheduleChase(wallet: string): void {
  if (chasing.has(wallet)) return;
  chasing.add(wallet);
  void (async () => {
    try {
      for (const delay of CHASE_DELAYS_MS) {
        await new Promise((r) => setTimeout(r, delay));
        if (!hasPendingInput(wallet)) return; // уже догнали другим путём
        try {
          const granted = await chasePendingInput(wallet);
          if (granted > 0) {
            console.log(`[nft-input-pending] ${wallet}: догнали ${granted} наград отложенно`);
            return;
          }
        } catch (e) {
          console.warn(
            "[nft-input-pending] отложенный догон не удался:",
            e instanceof Error ? e.message : e,
          );
        }
      }
    } finally {
      chasing.delete(wallet);
    }
  })();
}
