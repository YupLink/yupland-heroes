import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы: гекс-рейд (карта, бой, постройки, корабли, награды).
// Часть src/lib/translations.ts — импортируется через translations/index.ts.
//
// Экран боя был написан целиком по-русски: английский игрок читал «Урон за
// удар» и «ОПАСНОСТИ» посреди своего интерфейса (жалоба 25.08).
export const dict: Record<string, Entry> = {
  "braid.energy_next": { ru: "+5 через {time} · до {max}", en: "+5 in {time} · up to {max}" },
  "braid.energy_full": { ru: "Энергия полная", en: "Energy full" },
  "braid.act_interact": { ru: "Взаимодействовать", en: "Interact" },
  // Подсказка на кнопке разворота карты во весь экран (title-тултип).
  "braid.fullscreen_enter": { ru: "Полноэкранный", en: "Fullscreen" },
  "braid.fullscreen_exit": { ru: "Выйти из полноэкранного", en: "Exit fullscreen" },
  // Короткая запись чисел на полосе ресурсов: 10.5к / 1.24М.
  "braid.short_thousand": { ru: "к", en: "k" },
  "braid.short_million": { ru: "М", en: "M" },
  // ────────── окно боя ──────────
  "braid.object": { ru: "Объект", en: "Object" },
  "braid.loading": { ru: "Загружаем…", en: "Loading…" },
  "braid.damage_per_hit": { ru: "Урон за удар", en: "Damage per hit" },
  "braid.rewards_for": { ru: "Награды · {kind}", en: "Rewards · {kind}" },
  "braid.fighting": { ru: "Идёт бой…", en: "Fighting…" },
  "braid.already_looted": { ru: "Уже опустошён", en: "Already emptied" },
  "braid.need_energy": { ru: "Нужно {n} энергии", en: "Need {n} energy" },
  "braid.build_squad": { ru: "Собери отряд", en: "Build a squad" },
  "braid.dangers": { ru: "Опасности", en: "Dangers" },
  "braid.places_by_damage": { ru: "Места по урону", en: "Places by damage" },
  "braid.you_rank": { ru: "ты #{n}", en: "you #{n}" },
  "braid.attack": { ru: "Атаковать", en: "Attack" },

  // ────────── способности цели ──────────
  "braid.ab_poison": { ru: "Яд", en: "Poison" },
  "braid.ab_stun": { ru: "Оглушение", en: "Stun" },
  "braid.ab_cleave": { ru: "Удар по всем", en: "Cleave" },
  "braid.ab_slow": { ru: "Замедление", en: "Slow" },
  "braid.ab_burn_energy": { ru: "Выжигание энергии", en: "Energy burn" },
  "braid.ab_weak_atk": { ru: "Ослабление: атака", en: "Weaken: attack" },
  "braid.ab_weak_arm": { ru: "Ослабление: броня", en: "Weaken: armor" },
  "braid.ab_weak_luck": { ru: "Ослабление: удача", en: "Weaken: luck" },
  "braid.ab_weak_int": { ru: "Ослабление: интеллект", en: "Weaken: intellect" },
  "braid.effect": { ru: "Эффект", en: "Effect" },
  "braid.eff_poison": { ru: "−{n}% макс. HP фишки", en: "−{n}% of chip max HP" },
  "braid.eff_stun": { ru: "Фишка отдыхает", en: "Chip rests" },
  "braid.eff_cleave": { ru: "{n}% урона по всему строю", en: "{n}% damage to the whole line" },
  "braid.eff_slow": { ru: "+{n} энергии за шаг", en: "+{n} energy per step" },
  "braid.eff_burn": { ru: "−{n} энергии за удар", en: "−{n} energy per hit" },
  "braid.eff_weak_atk": { ru: "−{n} к атаке героя", en: "−{n} hero attack" },
  "braid.eff_weak_arm": { ru: "−{n} к броне героя", en: "−{n} hero armor" },
  "braid.eff_weak_luck": { ru: "−{n} к удаче героя", en: "−{n} hero luck" },
  "braid.eff_weak_int": { ru: "−{n} к интеллекту героя", en: "−{n} hero intellect" },
  "braid.dur_min": { ru: " · {n} мин", en: " · {n} min" },
  // От кого висит эффект — в HUD над героем (источник пишет сервер в строку).
  "braid.effect_from": { ru: "от: {name}", en: "from: {name}" },
  "braid.until_s": { ru: "{n}с", en: "{n}s" },
  "braid.until_m": { ru: "{n}м", en: "{n}m" },
  "braid.until_hm": { ru: "{h}ч {m}м", en: "{h}h {m}m" },

  // ────────── виды целей и действия ──────────
  "braid.kind_boss": { ru: "Босс", en: "Boss" },
  "braid.kind_chest": { ru: "Сундук", en: "Chest" },
  "braid.kind_mine": { ru: "Шахта", en: "Mine" },
  "braid.kind_artifact": { ru: "Артефакт", en: "Artifact" },
  "braid.act_fight": { ru: "В бой", en: "Fight" },
  "braid.act_collect": { ru: "Забрать", en: "Take" },
  "braid.act_open": { ru: "Открыть", en: "Open" },
  "braid.act_crack": { ru: "Вскрыть", en: "Break open" },
  "braid.act_build": { ru: "Построить", en: "Build" },
  "braid.go_here": { ru: "Идти сюда", en: "Walk here" },
  "braid.chambers_title": { ru: "Покои — снять эффекты", en: "Chambers — clear effects" },
  "braid.chambers_rest": { ru: "Отдохнуть", en: "Rest" },
  "braid.chambers_unfinished": {
    ru: "Покои ещё не достроены",
    en: "Chambers still under construction",
  },
  "braid.chambers_no_prices": {
    ru: "Покои закрыты — цена не задана",
    en: "Chambers closed — no price set",
  },
  "braid.chambers_nothing": { ru: "Сейчас снимать нечего", en: "Nothing to clear right now" },
  "braid.chambers_price_lost": {
    ru: "Цена изменилась — открой покои заново",
    en: "Price changed — reopen the chambers",
  },
  "braid.chambers_rested_toast": {
    ru: "Отдохнули: снято {n}, заплачено {paid}",
    en: "Rested: {n} cleared, paid {paid}",
  },
  "braid.chambers_grp_slow": { ru: "Замедление", en: "Slow" },
  "braid.chambers_grp_weaken": { ru: "Ослабление", en: "Weaken" },
  "braid.chambers_grp_stun": { ru: "Оглушение фишки", en: "Chip stun" },
  "braid.chambers_grp_poison": { ru: "Яд на фишке", en: "Chip poison" },
  // Университет (стейкинг фишек ради лайков).
  "braid.uni_title": { ru: "Университет", en: "University" },
  "braid.uni_level": { ru: "Уровень", en: "Level" },
  "braid.uni_bonus": { ru: "Множитель", en: "Bonus" },
  "braid.uni_rate": { ru: "Лайков в сутки", en: "Likes per day" },
  "braid.uni_pending": { ru: "Накоплено", en: "Accrued" },
  "braid.uni_pending_hint": {
    ru: "{base} базовых {mult} по этому зданию",
    en: "{base} base {mult} at this building",
  },
  "braid.uni_claim": { ru: "Забрать лайки", en: "Claim likes" },
  "braid.uni_staked_list": { ru: "В университете · {n}", en: "Staked · {n}" },
  "braid.uni_free_list": { ru: "Свободные фишки · {n}", en: "Free chips · {n}" },
  "braid.uni_none_staked": { ru: "Здесь пока пусто", en: "Nothing staked yet" },
  "braid.uni_none_free": { ru: "Свободных фишек нет", en: "No free chips" },
  "braid.uni_put": { ru: "Оставить · {n}", en: "Stake · {n}" },
  "braid.uni_take_back": { ru: "Забрать · {n}", en: "Take back · {n}" },
  "braid.uni_staked": { ru: "Фишек оставлено: {n}", en: "Chips staked: {n}" },
  "braid.uni_unstaked": { ru: "Фишек забрано: {n}", en: "Chips taken back: {n}" },
  "braid.uni_claimed": { ru: "Забрано лайков: {n}", en: "Likes claimed: {n}" },
  "braid.uni_per_day": { ru: "{n}/сут", en: "{n}/day" },
  "braid.uni_hint": {
    ru: "Фишки в университете не участвуют в боях. Забрать их и лайки можно в любом университете — множитель по тому, где забираешь.",
    en: "Staked chips do not fight. Take them and the likes at any university — the bonus is the one of the building you are at.",
  },
  "braid.uni_open": { ru: "Открыть университет", en: "Open university" },
  "braid.uni_slots": {
    ru: "Мест под обучение: {used} из {total}",
    en: "Study places: {used} of {total}",
  },
  "braid.uni_slot_buy": { ru: "+1 место · {price} золота", en: "+1 place · {price} gold" },
  "braid.uni_slot_bought": { ru: "Мест стало: {n}", en: "Places now: {n}" },
  "braid.uni_slots_max": { ru: "максимум {n}", en: "max {n}" },
  "braid.uni_slot": { ru: "место", en: "place" },
  "braid.uni_slot_locked": { ru: "закрыто", en: "locked" },
  "braid.uni_take_hint": { ru: "Забрать фишку с обучения", en: "Take the chip back" },
  "braid.uni_pick_title": { ru: "Кого отправить учиться", en: "Who goes to study" },
  "braid.uni_claim_n": { ru: "Забрать лайки · {n}", en: "Claim likes · {n}" },
  "braid.uni_claim_in": { ru: "Снова через {time}", en: "Available in {time}" },
  "braid.uni_capped": {
    ru: "Накоплено за неделю — дальше уже не капает, забирай",
    en: "Weekly cap reached — nothing more accrues, claim to continue",
  },
  // Музей: дом на карте для «фарма коллекций» из раздела Фишки.
  "braid.museum_title": { ru: "Музей", en: "Museum" },
  "braid.museum_open": { ru: "Открыть музей", en: "Open museum" },
  "braid.museum_preview": { ru: "Посмотреть коллекции", en: "Preview collections" },
  "braid.museum_preview_note": {
    ru: "Пока музей строится — можно смотреть, но забирать нельзя",
    en: "While the museum is under construction, you can preview but not claim",
  },
  "braid.museum_unfinished": {
    ru: "Музей ещё строится — сбор станет доступен, когда достроишь",
    en: "The museum is still under construction — claiming opens once it's finished",
  },
  "braid.museum_hint": {
    ru: "Собранные коллекции копят золото. Приходи в музей — забирай.",
    en: "Completed collections farm gold. Come to the museum to claim it.",
  },
  "braid.museum_farming": { ru: "Фармят · {n}", en: "Farming · {n}" },
  "braid.museum_none_active": {
    ru: "Пока ни одна коллекция не фармит. Собери каждый шаблон минимум на 3★.",
    en: "No collection is farming yet. Complete each template to at least 3★.",
  },
  "braid.museum_idle": { ru: "Ещё не фармят · {n}", en: "Not farming yet · {n}" },
  "braid.museum_idle_hint": {
    ru: "Собери каждый шаблон коллекции хотя бы на 3★.",
    en: "Complete each template of the collection to at least 3★.",
  },
  "braid.uni_unfinished": {
    ru: "Первый тир — стройка: университет заработает со второго",
    en: "First tier is construction: the university starts at the second",
  },
  "braid.uni_summary": {
    ru: "Уровень {lv} · {mult} · фишек {n}",
    en: "Level {lv} · {mult} · {n} chips",
  },

  "braid.go_walk": { ru: "Идти", en: "Go" },
  "braid.steps_n": { ru: "{n} шаг(ов)", en: "{n} steps" },
  "braid.cancel": { ru: "отмена", en: "cancel" },
  // Формы слова через «|»: ru — 1 / 2-4 / 5+, en — единственное / множественное.
  // Разбирает plural() из components/beta-raid/effectMeta.ts.
  "braid.pl_step": { ru: "шаг|шага|шагов", en: "step|steps" },

  // ────────── добыча ──────────
  "braid.loot_tickets": { ru: "золота", en: "gold" },
  "braid.loot_likes": { ru: "лайк", en: "like" },
  "braid.loot_energy": { ru: "энергия", en: "energy" },
  "braid.loot_pack": { ru: "пак", en: "pack" },
  "braid.loot_item": { ru: "предмет", en: "item" },

  // ────────── итог боя ──────────
  "braid.squad_wiped": { ru: "Отряд выбит", en: "Squad wiped" },
  "braid.rounds_n": { ru: "Раунды · {n}", en: "Rounds · {n}" },
  "braid.our_dmg": { ru: "Наш урон", en: "Our damage" },
  "braid.dmg_taken": { ru: "По нам", en: "Taken" },
  "braid.sum_energy_burned": { ru: "−{n} энергии", en: "−{n} energy" },
  "braid.sum_slow_step": { ru: "+{n} к шагу", en: "+{n} per step" },
  "braid.pl_chip_poisoned": {
    ru: "фишка отравлена|фишки отравлены|фишек отравлено",
    en: "chip poisoned|chips poisoned",
  },
  "braid.pl_chip": { ru: "фишка|фишки|фишек", en: "chip|chips" },
  "braid.pl_round": { ru: "раунд|раунда|раундов", en: "round|rounds" },

  // ────────── награды над картой ──────────
  "braid.claim_rewards_n": { ru: "Забрать награды · {n}", en: "Claim rewards · {n}" },
  "braid.raid_rewards": { ru: "Награды рейда", en: "Raid rewards" },
  "braid.rewards_claimed": { ru: "Награды забраны", en: "Rewards claimed" },
  "braid.rewards_already": { ru: "Награды уже забраны", en: "Rewards already claimed" },
  // Награду отложили, а не потеряли: рюкзак полон, герой не выбран, ссылка
  // битая. Причина уезжает описанием тоста, здесь — заголовок. Без этих строк
  // игрок видел зелёное «забрано» и не понимал, куда делся товар.
  "braid.rewards_deferred_all": {
    ru: "Ничего не выдано — награды остались в очереди",
    en: "Nothing delivered — the rewards stay in the queue",
  },
  "braid.rewards_deferred_some": {
    ru: "Часть наград осталась в очереди",
    en: "Some rewards stay in the queue",
  },
  "braid.total_line": { ru: "Итого: {parts}", en: "Total: {parts}" },
  "braid.claim": { ru: "Забрать", en: "Claim" },
  "braid.place_n": { ru: "место {n}", en: "place {n}" },
  "braid.rw_tickets": { ru: "золото", en: "gold" },
  "braid.rw_likes": { ru: "лайки", en: "likes" },
  "braid.rw_energy": { ru: "энергия", en: "energy" },
  "braid.rw_pack": { ru: "пак", en: "pack" },
  "braid.rw_item": { ru: "предмет", en: "item" },
  // Новые виды: ресурс единого счёта и свой товар маркета. Без этих строк
  // игрок читал бы в наградах сырое «gold» и «custom».
  "braid.rw_gold": { ru: "золото", en: "gold" },
  "braid.rw_stone": { ru: "камень", en: "stone" },
  "braid.rw_wood": { ru: "дерево", en: "wood" },
  "braid.rw_diamonds": { ru: "алмазы", en: "diamonds" },
  "braid.rw_resource": { ru: "ресурс", en: "resource" },
  "braid.rw_custom": { ru: "товар", en: "item" },

  // ────────── убегающие объекты ──────────
  // Объект с поведением «убегает» (сервер flee-move.ts) уходит на две клетки от
  // подошедшего игрока. Видно это соседям вокруг: карта у них перерисуется
  // сама, но без строчки перемещение выглядит сбоем.
  "braid.target_fled": {
    ru: "Цель убежала на две клетки",
    en: "Your target fled two hexes away",
  },
  // Дошли до цели, а её там уже нет: убежала или её забрал сосед. Почему —
  // клиенту не известно, и обещать он ничего не должен.
  "braid.target_gone": {
    ru: "Цели здесь больше нет",
    en: "Your target is no longer here",
  },
};
