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
  "ref.task_done_ticket": { ru: "Задание выполнено: +100 золота", en: "Task completed: +100 gold" },
  "ref.program": { ru: "Реферальная программа", en: "Referral program" },
  "ref.invite_friends": { ru: "Зови друзей —", en: "Invite friends —" },
  "ref.earn_tickets": { ru: "получай Bonus Box", en: "earn Bonus Boxes" },
  "ref.per_active_friend_pre": { ru: "золота за каждого", en: "gold for each" },
  "ref.active_word": { ru: "активного", en: "active" },
  "ref.per_active_friend_post": {
    ru: "друга и за тиеры приглашений.",
    en: "friend and for invite tiers.",
  },
  "ref.claim_tickets": { ru: "Золото", en: "Gold" },
  "ref.from_referrals": { ru: "от рефералов", en: "from referrals" },
  "ref.from_tasks": { ru: "от заданий", en: "from tasks" },
  "ref.tasks": { ru: "Задания", en: "Tasks" },
  "ref.plus_one_ticket_each": { ru: "· +100 золота за каждое", en: "· +100 gold each" },
  "ref.your_links": { ru: "Твои реферальные ссылки", en: "Your referral links" },
  // «Поделиться» приглашением (lib/referralShare.ts): подарок — только то, что новичок
  // и так получает (герой на выбор из шести рас), владелец 09.11.2026.
  "ref.share": { ru: "Поделиться", en: "Share" },
  "ref.share_text": {
    ru: "⚔️ Зову тебя в YupLand Heroes! По моей ссылке тебя ждёт подарок: свой герой — выбери любую из шести рас 🎁",
    en: "⚔️ Join me in YupLand Heroes! My link brings you a gift: your own hero — pick any of six races 🎁",
  },
  "ref.share_copied": {
    ru: "Текст и ссылка скопированы — отправь другу",
    en: "Text and link copied — send them to a friend",
  },
  "ref.invited_by": {
    ru: "🎁 Тебя пригласил {who} — подарок ждёт: свой герой на выбор",
    en: "🎁 You were invited by {who} — a gift awaits: a hero of your choice",
  },
  "ref.friend": { ru: "друг", en: "a friend" },
  "ref.copied": { ru: "Скопировано", en: "Copied" },
  "ref.for_telegram": { ru: "Для Телеграм", en: "For Telegram" },
  "ref.browser": { ru: "Браузер", en: "Browser" },
  "ref.friends": { ru: "Друзья", en: "Friends" },
  "ref.active_plural": { ru: "Засчитаны", en: "Counted" },
  "ref.their_claims": { ru: "Их клеймов", en: "Their claims" },
  "ref.referral_tiers": {
    ru: "Этапы приглашений · Bonus Box за каждый",
    en: "Invitation milestones · a Bonus Box each",
  },
  "ref.tier_reached": {
    ru: "Этап {n}: {count} засчитанных друзей · Bonus Box получен",
    en: "Milestone {n}: {count} counted friends · Bonus Box earned",
  },
  "ref.tier_needed": {
    ru: "Этап {n}: нужно {count} засчитанных друзей",
    en: "Milestone {n}: need {count} counted friends",
  },
  "ref.until_next_ticket": {
    ru: "До следующего Bonus Box: засчитанных друзей ещё {count}.",
    en: "Until the next Bonus Box: {count} more counted friend(s).",
  },
  "ref.all_tiers_done": {
    ru: "Все тиеры закрыты · +1300 золота получено.",
    en: "All tiers complete · +1,300 gold earned.",
  },
  "ref.your_referrals": { ru: "Твои рефералы", en: "Your referrals" },
  "ref.empty_referrals": {
    ru: "Пока никто не пришёл по твоей ссылке. Скопируй её выше и поделись.",
    en: "No one has joined via your link yet. Copy it above and share.",
  },
  "ref.joined_at": { ru: "пришёл {date}", en: "joined {date}" },
  "ref.plus_one_ticket": { ru: "Засчитан", en: "Counted" },
  "ref.awaiting_claim": { ru: "ждём клейм", en: "awaiting claim" },
  "ref.awaiting_pack": { ru: "ещё нет", en: "not yet" },
  "ref.plus_one_earned": { ru: "+100 золота получено", en: "+100 gold earned" },
  "ref.open": { ru: "Открыть", en: "Open" },
  "ref.check": { ru: "Проверить", en: "Check" },
  "ref.done": { ru: "Готово", en: "Done" },
};
