// Профиль вошедшего по кошельку без Telegram (владелец, 06.11.2026, пункт 3):
// привязка — в игре в Telegram, кошельком с подписью («Мой кошелёк»). Так оба ключа
// подтверждает один человек в одной сессии; ссылка на бота из сессии кошелька
// давала бы объединить аккаунт с чужим Telegram (кто нажал — тот и привязал).
// У Telegram уже есть аккаунт — остаётся тот, где больше ресурсов (acc-archive-01).
import { Send } from "lucide-react";
import { useT } from "@/lib/i18n";

export const GAME_IN_TELEGRAM = "https://t.me/yupland_heroes_bot?startapp";

export function LinkTelegramRow() {
  const t = useT();
  return (
    <a
      data-game-button="row"
      className="castle-profile__row"
      href={GAME_IN_TELEGRAM}
      target="_blank"
      rel="noopener"
    >
      <Send aria-hidden="true" />
      <span>{t("walletLogin.link_tg")}</span>
    </a>
  );
}
