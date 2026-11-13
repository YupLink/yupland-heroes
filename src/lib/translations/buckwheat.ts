import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: мини-игра «Корона гречневого королевства» (окно игры — minigames/buckwheat).
export const dict: Record<string, Entry> = {
  "bw.title": { ru: "Корона гречневого королевства", en: "Crown of the Buckwheat Kingdom" },
  "bw.play": { ru: "Играть", en: "Play" },
  "bw.stats.title": { ru: "Статистика ставок", en: "Betting stats" },
  "bw.stats.games": { ru: "Партий", en: "Games" },
  "bw.stats.players": { ru: "Игроков", en: "Players" },
  "bw.stats.staked": { ru: "Поставлено", en: "Staked" },
  "bw.stats.returned": { ru: "Выплачено", en: "Paid out" },
  "bw.stats.net": { ru: "Итог игры", en: "Game result" },
  "bw.stats.player": { ru: "Игрок", en: "Player" },
  "bw.stats.close": { ru: "Закрыть", en: "Close" },
  "bw.stats.error": { ru: "Не удалось загрузить", en: "Could not load" },
  "bw.stats.gold": { ru: "Золото", en: "Gold" },
  "bw.stats.darai": { ru: "DARAI", en: "DARAI" },
  // Фонд игры (09.11): ставки DARAI в него, выплаты из него; кошельки со ссылки.
  "bw.stats.fund": { ru: "Фонд игры", en: "Game fund" },
  "bw.stats.fund_in": { ru: "В фонд (ставки)", en: "Into fund (stakes)" },
  "bw.stats.fund_out": { ru: "Из фонда (выплаты)", en: "Out of fund (payouts)" },
  "bw.stats.from_map": { ru: "Сверх фонда — из пула карты", en: "Beyond fund — from map pool" },
  "bw.stats.link_accounts": { ru: "Новых кошельков по ссылке", en: "New wallets via link" },
  "bw.stats.link_in": { ru: "Они ввели", en: "They deposited" },
  "bw.stats.link_out": { ru: "Они вывели", en: "They withdrew" },
  // Ссылка /crown: ввод и вывод DARAI в шапке (08.11).
  "bw.wallet.topup": { ru: "Ввод", en: "Deposit" },
  "bw.wallet.withdraw": { ru: "Вывод", en: "Withdraw" },
  "bw.wallet.topup_title": { ru: "Ввод DARAI", en: "Deposit DARAI" },
  "bw.wallet.withdraw_title": { ru: "Вывод DARAI", en: "Withdraw DARAI" },
  "bw.wallet.buy": {
    ru: "Купить DARAI — обмен на Rhea (Ref Finance)",
    en: "Buy DARAI — swap on Rhea (Ref Finance)",
  },
  // Ссылка на игру (/crown): вход кошельком NEAR.
  "bw.login": { ru: "Войти кошельком NEAR", en: "Sign in with NEAR wallet" },
};
