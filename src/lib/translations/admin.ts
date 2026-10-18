import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Админка
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  // ────────── admin ──────────
  "admin.title": { ru: "Админ-панель", en: "Admin panel" },
  "admin.management": { ru: "Управление", en: "Management" },
  "admin.go_to_site": { ru: "На сайт", en: "Go to site" },
  "admin.logout": { ru: "Выйти", en: "Sign out" },
  "admin.nav_drops": { ru: "Дропы", en: "Drops" },
  "admin.nav_tasks": { ru: "Задания", en: "Tasks" },
  "admin.nav_shop": { ru: "Магазин билетов", en: "Ticket shop" },
  "admin.nav_history": { ru: "История", en: "History" },
  "admin.login_or": { ru: "или", en: "or" },
  "admin.login_field": { ru: "Логин", en: "Login" },
  "admin.password_field": { ru: "Пароль", en: "Password" },
  // Гейт входа в админку: сервер мог не ответить (перезапуск после выката),
  // и это не то же самое, что «нет прав» — тексты разные.
  "admin.gate_offline_title": { ru: "Сервер не отвечает", en: "Server is not responding" },
  "admin.gate_offline_text": {
    ru: "Скорее всего идёт выкат новой версии. Повтори через минуту.",
    en: "A new version is probably being deployed. Try again in a minute.",
  },
  "admin.gate_no_access": { ru: "Нет доступа к админке", en: "No access to the admin panel" },
};
