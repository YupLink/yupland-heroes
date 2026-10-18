import type { Lang } from "../store";
import { USDT_BANNED_MSG, USDT_BANNED_MSG_EN } from "@/lib/usdtBanned";
type Entry = Record<Lang, string>;

// Переводы: турниры — ошибки tour.err.* (общие для админки и окна постройки
// «Турнир») и строки админки /admin/tournaments. Категории tour.metric.* живут
// в словаре окна игрока (tournament.ts) — админка берёт их оттуда.
//
// Ошибки — ключами tour.err.*: их отдают и проверка строк мест (bandsError,
// lib/tournament/places.ts), и сервер (tour-admin.ts бросает ключ, например
// tour.err.pool — «пула не хватает»).
export const dict: Record<string, Entry> = {
  // ── ошибки ──
  "tour.err.places": {
    ru: "Места: число или диапазон — «1» или «2-3»",
    en: "Places: a number or a range — “1” or “2-3”",
  },
  "tour.err.no_prize": { ru: "У строки мест нет приза", en: "A places row has no prize" },
  "tour.err.amount": {
    ru: "Количество приза должно быть больше нуля",
    en: "Prize amount must be above zero",
  },
  "tour.err.overlap": { ru: "Места в строках пересекаются", en: "Places overlap between rows" },
  "tour.err.prize": {
    ru: "Выбери, что именно дать: токен, ресурс, бокс, артефакт или героя",
    en: "Choose what exactly to give: token, resource, box, artifact or hero",
  },
  // Приз USDT (prizeError): турнир платит без сверки со «Свободно USDT», §8.49а.
  "tour.err.usdt": { ru: USDT_BANNED_MSG, en: USDT_BANNED_MSG_EN },
  "tour.err.name": { ru: "Нужно название", en: "A name is required" },
  "tour.err.days": { ru: "Дней — от 1 до 90", en: "Days — from 1 to 90" },
  "tour.err.metric": { ru: "Неизвестная категория", en: "Unknown category" },
  "tour.err.pool": {
    ru: "В пуле карты не хватает DARAI на фонд — турнир не запущен",
    en: "The map pool lacks DARAI for the fund — the tournament was not started",
  },
  "tour.err.state": {
    ru: "Статус турнира уже другой — список обновлён",
    en: "The tournament status has changed — the list is refreshed",
  },
  "tour.err.not_found": { ru: "Турнир не найден", en: "Tournament not found" },
  "tour.err.not_here": { ru: "Здесь нет турниров", en: "There are no tournaments here" },
  "tour.err.far": { ru: "Подойди к постройке ближе", en: "Come closer to the building" },
  // Удаление черновика, на который уже записались (04.10.2026). Ошибки записи
  // (tour.err.no_fee, tour.err.busy, tour.err.not_open) — в словаре окна игрока (tournament.ts).
  "tour.err.has_entries": {
    ru: "На турнир уже записались игроки — удалить нельзя",
    en: "Players have already joined — the tournament can't be deleted",
  },
  // Сорванной записи плата ещё не вернулась — каскад стёр бы долг игроку.
  "tour.err.refund_pending": {
    ru: "Плата за сорванную запись ещё возвращается — попробуй через минуту",
    en: "A failed entry fee is still being refunded — try again in a minute",
  },
  // цена записи (entryPrice.tourEntryPriceError): форма и adminTourSave
  "tour.err.price_rows": {
    ru: "Цена записи — не больше 4 строк",
    en: "The entry price can have at most 4 lines",
  },
  "tour.err.price_resource": {
    ru: "Этим за запись не заплатить — выбери другой ресурс",
    en: "This can't pay for entry — pick another resource",
  },
  "tour.err.price_amount": {
    ru: "Цена записи: сумма больше нуля, целая (дробная — только у токена и энергии)",
    en: "Entry price: the amount must be above zero and whole (fractions only for tokens and energy)",
  },
  "tour.err.price_token": { ru: "Цена записи: выбери монету", en: "Entry price: pick a coin" },
  "tour.err.price_item": { ru: "Цена записи: выбери товар", en: "Entry price: pick an item" },
  // расписание (начало/конец по UTC): форма и adminTourSave
  "tour.err.time": { ru: "Неверная дата или время", en: "Invalid date or time" },
  "tour.err.start_past": {
    ru: "Начало уже прошло — укажи время позже",
    en: "The start is in the past — set a later time",
  },
  "tour.err.end_before_start": {
    ru: "Конец должен быть позже начала",
    en: "The end must be after the start",
  },
  "tour.err.end_no_start": {
    ru: "Конец без начала не задают — укажи и начало",
    en: "Set the start as well as the end",
  },

  // ── админка: список ──
  "tour.adm.title": { ru: "Турниры", en: "Tournaments" },
  "tour.adm.create": { ru: "Создать", en: "Create" },
  "tour.adm.empty": { ru: "Турниров пока нет", en: "No tournaments yet" },
  "tour.adm.sec_draft": { ru: "Черновики", en: "Drafts" },
  "tour.adm.sec_running": { ru: "Идут", en: "Running" },
  "tour.adm.sec_done": { ru: "Завершены", en: "Finished" },
  "tour.adm.status_draft": { ru: "Черновик", en: "Draft" },
  "tour.adm.status_running": { ru: "Идёт", en: "Running" },
  "tour.adm.status_paying": { ru: "Раздаём призы", en: "Paying out" },
  "tour.adm.status_done": { ru: "Завершён", en: "Finished" },
  "tour.adm.days": { ru: "{n} дн.", en: "{n} d" },
  "tour.adm.left": { ru: "осталось {v}", en: "{v} left" },
  "tour.adm.left_over": { ru: "время вышло", en: "time is up" },
  "tour.adm.unit_d": { ru: "{n} д", en: "{n}d" },
  "tour.adm.unit_h": { ru: "{n} ч", en: "{n}h" },
  "tour.adm.unit_m": { ru: "{n} мин", en: "{n}m" },
  "tour.adm.players": { ru: "участников: {n}", en: "players: {n}" },
  "tour.adm.fund": { ru: "фонд {n} DARAI", en: "fund {n} DARAI" },
  // Цена записи в строке плашки ({v} — tourEntryPriceLabel).
  "tour.adm.entry": { ru: "запись {v}", en: "entry {v}" },
  "tour.adm.entry_free": { ru: "запись бесплатная", en: "free entry" },
  "tour.adm.started_at": { ru: "старт {v} UTC", en: "started {v} UTC" },
  "tour.adm.ends_at": { ru: "конец {v} UTC", en: "ends {v} UTC" },
  "tour.adm.auto_start": { ru: "Автостарт {v} UTC", en: "Auto-start {v} UTC" },
  "tour.adm.finished_at": { ru: "финиш {v} UTC", en: "finished {v} UTC" },

  // ── админка: кнопки плашки ──
  "tour.adm.start": { ru: "Запустить", en: "Start" },
  // Режим «проверка» (TOUR_LIVE = false): очки копятся, призов и брони пула нет.
  "tour.adm.start_dry": { ru: "Запустить проверку", en: "Start a check" },
  "tour.adm.dry": { ru: "Проверка", en: "Check" },
  "tour.adm.stop": { ru: "Остановить", en: "Stop" },
  "tour.adm.edit": { ru: "Изменить", en: "Edit" },
  "tour.adm.delete": { ru: "Удалить", en: "Delete" },
  "tour.adm.stop_q": {
    ru: "Завершить сейчас и раздать призы по текущим местам?",
    en: "Finish now and award prizes by the current places?",
  },
  "tour.adm.stop_yes": { ru: "Да, завершить", en: "Yes, finish" },
  "tour.adm.delete_q": { ru: "Удалить черновик?", en: "Delete the draft?" },
  "tour.adm.delete_yes": { ru: "Да, удалить", en: "Yes, delete" },
  "tour.adm.cancel": { ru: "Отмена", en: "Cancel" },
  "tour.adm.started_ok": { ru: "Турнир запущен", en: "Tournament started" },
  "tour.adm.stopped_ok": { ru: "Турнир завершён", en: "Tournament finished" },
  "tour.adm.deleted_ok": { ru: "Черновик удалён", en: "Draft deleted" },
  "tour.adm.saved_ok": { ru: "Сохранено", en: "Saved" },

  // ── админка: форма ──
  "tour.adm.new": { ru: "Новый турнир", en: "New tournament" },
  "tour.adm.edit_title": { ru: "Правка турнира", en: "Edit tournament" },
  "tour.adm.f_name": { ru: "Название", en: "Name" },
  "tour.adm.f_metric": { ru: "Категория", en: "Category" },
  "tour.adm.f_potions": { ru: "Зелья", en: "Potions" },
  "tour.adm.potions_all": { ru: "Все со скоростью", en: "All with speed" },
  "tour.adm.f_days": { ru: "Дней", en: "Days" },
  "tour.adm.f_start": { ru: "Начало, UTC", en: "Start, UTC" },
  "tour.adm.f_end": { ru: "Конец, UTC", en: "End, UTC" },
  "tour.adm.clear": { ru: "Очистить", en: "Clear" },
  "tour.adm.f_places": { ru: "Места", en: "Places" },
  "tour.adm.add_band": { ru: "Строка мест", en: "Places row" },
  "tour.adm.add_prize": { ru: "Приз", en: "Prize" },
  "tour.adm.save": { ru: "Сохранить", en: "Save" },
  "tour.adm.close": { ru: "Закрыть", en: "Close" },
  "tour.adm.remove": { ru: "Убрать", en: "Remove" },
  "tour.adm.sum": {
    ru: "Фонд DARAI: {fund} · призовых мест: {places}",
    en: "DARAI fund: {fund} · prize places: {places}",
  },
  "tour.adm.amount": { ru: "сколько", en: "amount" },

  // ── админка: виды призов ──
  "tour.adm.kind.darai": { ru: "DARAI", en: "DARAI" },
  "tour.adm.kind.custom": { ru: "Свой товар", en: "Custom item" },
  "tour.adm.kind.art_rarity": { ru: "Артефакт по редкости", en: "Artifact by rarity" },
  "tour.adm.pick_custom": { ru: "Выбрать товар", en: "Pick an item" },
  "tour.adm.art_any": { ru: "Любой", en: "Any" },
  "tour.adm.art_exact": { ru: "— или конкретный —", en: "— or a specific one —" },
  "tour.adm.rarity.legendary": { ru: "Легендарный", en: "Legendary" },
  "tour.adm.rarity.epic": { ru: "Эпический", en: "Epic" },
  "tour.adm.rarity.rare": { ru: "Редкий", en: "Rare" },
  "tour.adm.rarity.common": { ru: "Обычный", en: "Common" },
  "tour.adm.kind.token": { ru: "Токен", en: "Token" },
  "tour.adm.kind.resource": { ru: "Ресурс", en: "Resource" },
  "tour.adm.kind.pack": { ru: "Бокс", en: "Box" },
  "tour.adm.kind.art": { ru: "Артефакт", en: "Artifact" },
  "tour.adm.kind.hero": { ru: "Герой", en: "Hero" },
  "tour.adm.kind.item": { ru: "Предмет", en: "Item" },
  "tour.adm.kind.energy": { ru: "Энергия", en: "Energy" },
  "tour.adm.kind.likes": { ru: "Лайки", en: "Likes" },
  "tour.adm.kind.tickets": { ru: "Билеты", en: "Tickets" },
  "tour.adm.pick_pack": { ru: "— выбери бокс —", en: "— choose a box —" },
  "tour.adm.pick_art": { ru: "— выбери артефакт —", en: "— choose an artifact —" },
  "tour.adm.pick_hero": { ru: "— выбери героя —", en: "— choose a hero —" },
  "tour.adm.no_tokens": { ru: "нет токенов", en: "no tokens" },
  "tour.adm.group_box": { ru: "Боксы", en: "Boxes" },
  "tour.adm.group_chip": { ru: "Чип-паки", en: "Chip packs" },
  "tour.adm.group_nft": { ru: "NFT-паки", en: "NFT packs" },
  "tour.adm.loading": { ru: "Загрузка…", en: "Loading…" },

  // ── админка: таблица и очки участника ──
  "tour.adm.board": { ru: "Таблица", en: "Leaderboard" },
  "tour.adm.board_empty": { ru: "Пока никто не набрал очков", en: "No one has scored yet" },
  "tour.adm.more": { ru: "Ещё {n}", en: "{n} more" },
  "tour.adm.back": { ru: "К таблице", en: "Back to the table" },
  "tour.adm.pts_title": { ru: "Очки: {name}", en: "Points: {name}" },
  "tour.adm.pts_empty": { ru: "Очков нет", en: "No points" },
  "tour.adm.pts_total": { ru: "Строк: {n} · сумма {sum}", en: "Rows: {n} · total {sum}" },
};
