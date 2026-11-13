// Окно «Добыча» и кружок «Подарки» — обе кнопки под мини-картой рейда.
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {

  "harvest.captures_title": { ru: "Перехвачены", en: "Captured" },
  "harvest.collect_one": { ru: "Собрать", en: "Collect" },
  "harvest.collect_one_label": { ru: "Собрать: {name}", en: "Collect: {name}" },
  "harvest.collecting": { ru: "Сбор…", en: "Collecting…" },
  "harvest.capture_unavailable": { ru: "Этот остаток уже собран или недоступен", en: "This remainder is already collected or unavailable" },
  "harvest.source_count": { ru: "· {n} шт.", en: "· {n} total" },
  "harvest.seized_n": { ru: "· Перехвачено {n}", en: "· Taken {n}" },
  "harvest.stopped_n": { ru: "· Остановлено {n}", en: "· Stopped {n}" },
  "harvest.my_mines_mushrooms_n": { ru: "Шахты и грибы · {n}", en: "Mines and mushrooms · {n}" },
  "harvest.my_farms_n": { ru: "Фермы · {n}", en: "Farms · {n}" },
  "harvest.no_mines_mushrooms": { ru: "Шахт и грибов пока нет", en: "No mines or mushrooms yet" },
  "harvest.no_active_farms": {
    ru: "На фермах нет твоих героев",
    en: "None of your heroes are farming",
  },
  "harvest.mushroom_seized": { ru: "Перехвачен", en: "Taken" },
  "harvest.mushroom_expired": { ru: "Исчез", en: "Expired" },
  "harvest.until_expiry": { ru: "До исчезновения", en: "Expires in" },
  "harvest.ready_to_collect": { ru: "К сбору", en: "Ready to collect" },
  "harvest.mine_seized": { ru: "Перехвачена", en: "Captured" },
  "harvest.mine_stopped": { ru: "Остановлена", en: "Stopped" },
  "harvest.cell_short": { ru: "кл. {q},{r}", en: "cell {q},{r}" },
  "harvest.until_break": { ru: "До поломки", en: "Until breakdown" },
  "harvest.mine_status": { ru: "Статус", en: "Status" },
  "harvest.mine_broken": { ru: "Сломана", en: "Broken" },
  "harvest.personal_slots_label": { ru: "Личные ячейки", en: "Personal slots" },
  "harvest.hours_short": { ru: "ч", en: "h" },
  "harvest.my_sources_n": { ru: "Мои шахты и фермы · {n}", en: "My mines and farms · {n}" },
  "harvest.details": { ru: "Подробнее", en: "Details" },
  "harvest.hide_details": { ru: "Свернуть", en: "Hide details" },
  "harvest.collected_label": { ru: "Собрано", en: "Collected" },
  // ─────────── Добыча ───────────
  "harvest.title": { ru: "Добыча", en: "Harvest" },
  "harvest.mines": { ru: "Шахты", en: "Mines" },
  "harvest.fields": { ru: "Поля", en: "Fields" },
  "harvest.rewards": { ru: "Награды", en: "Rewards" },
  "harvest.per_hour": { ru: "{n} в час", en: "{n}/h" },
  "harvest.ready": { ru: "готово {n}", en: "ready {n}" },
  "harvest.growing": { ru: "зреет {n}", en: "growing {n}" },
  "harvest.stored_at": {
    ru: "на складе поля: {n} · склад",
    en: "at the field's warehouse: {n} · cell",
  },
  "harvest.cell": { ru: "клетка {q},{r}", en: "cell {q},{r}" },
  "harvest.show_on_map": { ru: "Показать на карте", en: "Show on map" },
  "harvest.no_mines": { ru: "Захваченных шахт пока нет", en: "No mines captured yet" },
  "harvest.no_fields": { ru: "Ты нигде не сеешь", en: "You are not farming anywhere" },
  "harvest.no_rewards": { ru: "Наград к получению нет", en: "Nothing to claim" },
  "harvest.collect_all": { ru: "Собрать со всех шахт", en: "Collect from all mines" },
  "harvest.worker": { ru: "работает {name}", en: "{name} works" },
  "harvest.no_worker": { ru: "герой снят", en: "no hero" },
  "harvest.workers_n": { ru: "работников: {n}", en: "workers: {n}" },
  "harvest.total_per_hour": { ru: "Всего в час", en: "Total per hour" },
  "harvest.by_kind_title": { ru: "Мой доход в час", en: "My hourly income" },
  "harvest.nothing_ready": { ru: "Пока нечего собирать", en: "Nothing ready yet" },
  "harvest.mines_n": { ru: "Шахты · {n}", en: "Mines · {n}" },
  "harvest.fields_n": { ru: "Поля · {n}", en: "Fields · {n}" },
  "harvest.rewards_n": { ru: "Награды · {n}", en: "Rewards · {n}" },
  // Очередь по ТИПАМ: у каждой группы своя кнопка «Забрать» (braid.claim),
  // общая в футере забирает всё. Раньше в полный рюкзак влезало «что попало».
  "harvest.claim_all_rewards": { ru: "Забрать все награды", en: "Claim all rewards" },
  "harvest.group_rewards_n": { ru: "наград: {n}", en: "{n} rewards" },
  // Остаток до сгорания (добыча разграбленного сундука ждёт 24 ч).
  "harvest.left_hm": { ru: "{h} ч {m} мин", en: "{h} h {m} min" },
  "harvest.left_m": { ru: "{m} мин", en: "{m} min" },
  "harvest.group_claimed": {
    ru: "{label}: забрано наград — {n}",
    en: "{label}: rewards claimed — {n}",
  },
  "harvest.group_left": {
    ru: "{label}: забрано наград — {n}, в очереди ещё {left}",
    en: "{label}: rewards claimed — {n}, {left} still queued",
  },
  "harvest.by_source_n": { ru: "По целям · {n}", en: "By target · {n}" },
  // Токен не зачисляется на счёт, а становится заявкой в «Выплатах»: без
  // подписи зелёное «забрано» без видимого баланса читалось бы как потеря.
  "harvest.token_to_payouts": { ru: "уйдёт в Выплаты", en: "goes to Payouts" },

  // ─────────── Подарки ───────────
  "gifts.title": { ru: "Подарки", en: "Gifts" },
  "gifts.empty": { ru: "Подарков пока нет", en: "No gifts yet" },
  "gifts.claim": { ru: "Забрать", en: "Claim" },
  "gifts.claim_all": { ru: "Забрать всё", en: "Claim all" },
  "gifts.claimed_toast": { ru: "Подарок забран", en: "Gift claimed" },
  "gifts.open_pack": { ru: "Открыть пак", en: "Open pack" },
  "gifts.view_hero": { ru: "Посмотреть героя", en: "View hero" },
  "gifts.view_artifact": { ru: "Посмотреть артефакт", en: "View artifact" },
  "gifts.other_gifts": { ru: "Другие подарки", en: "Other gifts" },
  "gifts.done": { ru: "Готово", en: "Done" },
  "gifts.claimed_n": { ru: "Забрано подарков: {n}", en: "Gifts claimed: {n}" },
  "gifts.from_admin": { ru: "От команды игры", en: "From the game team" },
  "gifts.hint": {
    ru: "Награда придёт на счёт, когда заберёшь её здесь",
    en: "The reward lands on your account once you claim it here",
  },
  // Срок в карточке: подарок ждёт 48 часов и сгорает (gifts-expire.ts).
  "gifts.expires_in": { ru: "сгорит через {n} ч", en: "expires in {n} h" },
  "gifts.expires_soon": {
    ru: "сгорит меньше чем через час",
    en: "expires in under an hour",
  },

  // Отказы сервера приходят ключом, а не фразой (см. humanError).
  "gifts.err_no_wallet": { ru: "Подключи кошелёк", en: "Connect a wallet" },
  "gifts.err_no_account": {
    ru: "Нужен аккаунт — привяжи Telegram",
    en: "You need an account — link Telegram",
  },
  "gifts.err_taken": { ru: "Подарок уже забран", en: "This gift is already claimed" },
  "gifts.err_expired": {
    ru: "Срок вышел — подарок сгорел",
    en: "Time's up — the gift has expired",
  },

  // Виды подарков — подпись в списке.
  "gifts.kind.likes": { ru: "Лайки", en: "Likes" },
  "gifts.kind.energy": { ru: "Энергия", en: "Energy" },
  "gifts.kind.tickets": { ru: "Золото", en: "Gold" },
  "gifts.kind.resource": { ru: "Ресурс", en: "Resource" },
  "gifts.kind.token": { ru: "Монеты", en: "Coins" },
  "gifts.kind.pack": { ru: "Пак", en: "Pack" },
  "gifts.kind.hero": { ru: "Герой", en: "Hero" },
  "gifts.kind.art": { ru: "Артефакт", en: "Artifact" },
  "gifts.kind.custom": { ru: "Товар", en: "Item" },
  "gifts.kind.item": { ru: "Предмет", en: "Item" },

  // ─────────── Админская раздача ───────────
  "gifts.admin.title": { ru: "Раздать энергию активным", en: "Energy for active players" },
  "gifts.admin.hint": {
    ru: "Только ТГ-аккаунты, активные за последние 48 часов · подарком",
    en: "Telegram accounts active in the last 48 hours · as a gift",
  },
  "gifts.admin.send": { ru: "Раздать", en: "Send" },
  "gifts.admin.done": {
    ru: "Подарки разосланы на {n} аккаунтов, уведомлений в боте: {sent}",
    en: "Gifts sent to {n} accounts, bot notifications: {sent}",
  },
  // Замок (дизайн Ангелины, 07.10.2026)
  "harvest.stored": { ru: "у меня на складах {n}", en: "on my shelves {n}" },
  "harvest.source.Противник": { ru: "Противник", en: "Opponent" },
  "harvest.source.Сундук": { ru: "Сундук", en: "Chest" },
  "harvest.source.Рейд": { ru: "Рейд", en: "Raid" },
  "harvest.collect_unconfirmed": {
    ru: "Сбор не подтвердился. Проверь баланс ресурсов и попробуй позже.",
    en: "Collection was not confirmed. Check your resources and try again later.",
  },
  "harvest.claim_rewards": { ru: "Забрать награды", en: "Claim rewards" },
  "harvest.income_title": { ru: "Доход в час", en: "Income per hour" },
  "harvest.raid_rewards_n": { ru: "Награды с рейда · {n}", en: "Raid rewards · {n}" },
  "harvest.mine_singular": { ru: "Шахта", en: "Mine" },
  "harvest.field_singular": { ru: "Поле", en: "Field" },
  "harvest.rate_suffix": { ru: "/ч", en: "/h" },
  "harvest.accrued": { ru: "Накоплено {n}", en: "Accrued {n}" },
  "harvest.on_shelf": { ru: "На складе {n}", en: "In storage {n}" },
  "harvest.ready_short": { ru: "Готово {n}", en: "Ready {n}" },
  "harvest.accrued_label": { ru: "Накоплено", en: "Accrued" },
  "harvest.on_shelf_label": { ru: "На складе", en: "In storage" },
  "harvest.ready_label": { ru: "Готово", en: "Ready" },
  "harvest.no_income": { ru: "Шахт и полей пока нет", en: "No mines or fields yet" },
  "harvest.scroll_next": { ru: "Показать следующие ресурсы", en: "Show more resources" },
  "harvest.scroll_previous": { ru: "Показать предыдущие ресурсы", en: "Show previous resources" },
  "harvest.load_error": { ru: "Не удалось загрузить добычу", en: "Could not load harvest" },
  "harvest.retry": { ru: "Повторить", en: "Retry" },
  "gifts.claim_individually": { ru: "Забирай подарки по одному", en: "Claim gifts one by one" },
  "gifts.claimed_partial": {
    ru: "Забрано: {claimed}. Не удалось забрать: {failed}. Попробуй ещё раз",
    en: "Claimed: {claimed}. Failed: {failed}. Please try again",
  },
  "gifts.claim_unconfirmed": {
    ru: "Не удалось подтвердить выдачу. Обнови список и попробуй ещё раз",
    en: "Could not confirm the claim. Refresh the list and try again",
  },
};

