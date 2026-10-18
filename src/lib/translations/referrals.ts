import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Рефералы
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  // ────────── referrals ──────────
  "ref.title": { ru: "Рефералы", en: "Referrals" },
  // ────────── referrals (extended) ──────────
  "ref.task_already_done": { ru: "Задание уже было выполнено", en: "Task already completed" },
  "ref.task_done_ticket": { ru: "Задание выполнено: +1 билет", en: "Task completed: +1 ticket" },
  "ref.program": { ru: "Реферальная программа", en: "Referral program" },
  "ref.invite_friends": { ru: "Зови друзей —", en: "Invite friends —" },
  "ref.earn_tickets": { ru: "получай билеты", en: "earn tickets" },
  "ref.per_active_friend_pre": { ru: "билет за каждого", en: "ticket for each" },
  "ref.active_word": { ru: "активного", en: "active" },
  "ref.per_active_friend_post": {
    ru: "друга и за тиеры приглашений.",
    en: "friend and for invite tiers.",
  },
  "ref.claim_tickets": { ru: "Билеты на клейм", en: "Claim tickets" },
  "ref.from_referrals": { ru: "от рефералов", en: "from referrals" },
  "ref.from_tasks": { ru: "от заданий", en: "from tasks" },
  "ref.tasks": { ru: "Задания", en: "Tasks" },
  "ref.plus_one_ticket_each": { ru: "· +1 билет за каждое", en: "· +1 ticket each" },
  "ref.your_links": { ru: "Твои реферальные ссылки", en: "Your referral links" },
  "ref.copied": { ru: "Скопировано", en: "Copied" },
  "ref.for_telegram": { ru: "Для Телеграм", en: "For Telegram" },
  "ref.browser": { ru: "Браузер", en: "Browser" },
  "ref.friends": { ru: "Друзья", en: "Friends" },
  "ref.active_plural": { ru: "С паком", en: "With pack" },
  "ref.their_claims": { ru: "Их клеймов", en: "Their claims" },
  "ref.referral_tiers": {
    ru: "Тиеры рефералов · +1 билет на каждом",
    en: "Referral tiers · +1 ticket each",
  },
  "ref.tier_reached": {
    ru: "Тиер {n}: {count} рефералов · билет получен",
    en: "Tier {n}: {count} referrals · ticket earned",
  },
  "ref.tier_needed": {
    ru: "Тиер {n}: нужно {count} рефералов",
    en: "Tier {n}: need {count} referrals",
  },
  "ref.until_next_ticket": {
    ru: "До следующего билета: ещё {count} реферал(ов).",
    en: "Until next ticket: {count} more referral(s).",
  },
  "ref.all_tiers_done": {
    ru: "Все тиеры закрыты · +13 билетов получено.",
    en: "All tiers complete · +13 tickets earned.",
  },
  "ref.your_referrals": { ru: "Твои рефералы", en: "Your referrals" },
  "ref.empty_referrals": {
    ru: "Пока никто не пришёл по твоей ссылке. Скопируй её выше и поделись.",
    en: "No one has joined via your link yet. Copy it above and share.",
  },
  "ref.joined_at": { ru: "пришёл {date}", en: "joined {date}" },
  "ref.plus_one_ticket": { ru: "+1 билет", en: "+1 ticket" },
  "ref.awaiting_claim": { ru: "ждём клейм", en: "awaiting claim" },
  "ref.awaiting_pack": { ru: "ждём покупку пака", en: "awaiting pack purchase" },
  "ref.plus_one_earned": { ru: "+1 получено", en: "+1 earned" },
  "ref.open": { ru: "Открыть", en: "Open" },
  "ref.check": { ru: "Проверить", en: "Check" },
  "ref.done": { ru: "Готово", en: "Done" },
};
