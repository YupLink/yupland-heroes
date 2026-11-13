import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: Поиск
// Часть src/lib/translations.ts — разбита на субдомены.
// Импортируется через src/lib/translations/index.ts
export const dict: Record<string, Entry> = {
  // ────────── lookup ──────────
  "lookup.kicker": { ru: "Поиск NFT", en: "NFT lookup" },
  "lookup.title": { ru: "Проверить", en: "Check" },
  "lookup.title_accent": { ru: "погашение", en: "redemption" },
  "lookup.input_label": { ru: "Token ID", en: "Token ID" },
  "lookup.placeholder": { ru: "например 153063", en: "e.g. 153063" },
  "lookup.find_btn": { ru: "Найти", en: "Find" },
  "lookup.title_label": { ru: "Название", en: "Title" },
  "lookup.current_owner": { ru: "Сейчас владеет", en: "Current owner" },
  "lookup.history": { ru: "История погашений", en: "Redemption history" },
  // ────────── lookup (extended) ──────────
  "lookup.no_image": { ru: "нет картинки", en: "no image" },
  "lookup.status_paid": { ru: "выплачен", en: "paid" },
  "lookup.status_pending": { ru: "pending", en: "pending" },
  "lookup.wallet": { ru: "кошелёк", en: "wallet" },
  "lookup.cooldown_hours": { ru: "cooldown {n}ч", en: "cooldown {n}h" },
  "lookup.alerts_on": { ru: "Уведомления включены", en: "Alerts enabled" },
  "lookup.alerts_off": { ru: "Уведомления выключены", en: "Alerts disabled" },
  "lookup.check_result": {
    ru: "Подходит: {matched}, отправлено новых: {notified}",
    en: "Matched: {matched}, new sent: {notified}",
  },
  "lookup.admin_sendler_lots": { ru: "Админ · Лоты Sendler", en: "Admin · Sendler lots" },
  "lookup.matches_label": { ru: "подходит:", en: "matches:" },
  "lookup.on": { ru: "ВКЛ", en: "ON" },
  "lookup.off": { ru: "ВЫКЛ", en: "OFF" },
  "lookup.check_btn": { ru: "Проверить", en: "Check" },
  "lookup.last_check": { ru: "посл. проверка:", en: "last check:" },
  "lookup.filters": { ru: "Фильтры", en: "Filters" },
  "lookup.matching_lots": {
    ru: "Подходящие лоты ({n}) · по цене ↑",
    en: "Matching lots ({n}) · by price ↑",
  },
  "lookup.counting": { ru: "Считаем…", en: "Counting…" },
  "lookup.no_lots": {
    ru: "Сейчас в маркете нет лотов под наши кампании.",
    en: "No marketplace lots match our campaigns right now.",
  },
  "lookup.open_sendler": {
    ru: "Открыть маркет Sendler в новой вкладке",
    en: "Open Sendler market in a new tab",
  },
  "lookup.seller": { ru: "продавец:", en: "seller:" },
  "lookup.need_have": { ru: "нужно {need}, есть {have}", en: "need {need}, have {have}" },
  "lookup.tickets_plus": { ru: "+{n} золота", en: "+{n} gold" },
  "lookup.summary_max": { ru: "max: {list}", en: "max: {list}" },
  "lookup.summary_exclude": { ru: "искл: {list}", en: "excl: {list}" },
  "lookup.summary_campaigns": { ru: "кампаний: {n}", en: "campaigns: {n}" },
  "lookup.all_lots": { ru: "все лоты", en: "all lots" },
  "lookup.filters_saved": { ru: "Фильтры сохранены", en: "Filters saved" },
  "lookup.alert_filters": { ru: "Фильтры уведомлений", en: "Alert filters" },
  "lookup.by_payment_token": { ru: "По токену оплаты", en: "By payment token" },
  "lookup.max_price": { ru: "макс. цена", en: "max price" },
  "lookup.exclude": { ru: "исключить", en: "exclude" },
  "lookup.only_campaigns": { ru: "Только эти кампании", en: "Only these campaigns" },
  "lookup.reset": { ru: "сбросить", en: "reset" },
  "lookup.campaigns_hint": {
    ru: "Если ничего не выбрано — уведомления для всех активных кампаний.",
    en: "If nothing is selected — alerts for all active campaigns.",
  },
  "lookup.save_filters": { ru: "Сохранить фильтры", en: "Save filters" },

  // ── восстановлено после декомпозиции (потерялись при разбиении) ──
  "lookup.active_drops": {
    ru: "Активные дропы для этого NFT",
    en: "Active drops for this NFT",
  },
  "lookup.already_redeemed_here": {
    ru: "· уже погашен здесь",
    en: "· already redeemed here",
  },
  "lookup.available_to_redeem": {
    ru: "· доступен для погашения",
    en: "· available to redeem",
  },
  "lookup.contract_label": {
    ru: "Контракт: ",
    en: "Contract: ",
  },
  "lookup.desc": {
    ru: "Введи token_id NFT — увидишь, был ли он погашён, и в каких дропах ещё участвует.",
    en: "Enter NFT token_id — see if it's been redeemed and which drops it can join.",
  },
  "lookup.history_empty": {
    ru: "Эта NFT ещё не погашалась ни в одном дропе.",
    en: "This NFT hasn't been redeemed in any drop yet.",
  },
  "lookup.ticket_events": {
    ru: "События холда с этим NFT (золото)",
    en: "Holding events with this NFT (gold)",
  },
};
