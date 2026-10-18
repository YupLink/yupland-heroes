// Генератор зоны в режиме бога: панель рецепта, ИИ-подсказка, отчёт.
import type { Lang } from "../store";

export const dict: Record<string, Record<Lang, string>> = {
  // ─────────── Шапка и режимы ───────────
  "zonegen.title": { ru: "Генератор зоны", en: "Zone generator" },
  "zonegen.cells_n": { ru: "{n} кл.", en: "{n} cells" },

  // ─────────── Слои местности ───────────
  "zonegen.layers": { ru: "Местности", en: "Terrains" },
  "zonegen.add_layer": { ru: "+ слой", en: "+ layer" },
  "zonegen.weight_pct": { ru: "вес %", en: "weight %" },
  "zonegen.remove_layer": { ru: "Убрать слой", en: "Remove layer" },
  "zonegen.no_terrains": { ru: "нет типов местности", en: "no terrain types" },

  // ─────────── Настройки рецепта ───────────
  "zonegen.scale": { ru: "Масштаб пятен", en: "Patch scale" },
  "zonegen.decor_rate": { ru: "Плотность декора", en: "Decor density" },
  "zonegen.decor_rate_hint": { ru: "как на карте ×1.0", en: "as on the map ×1.0" },
  "zonegen.decor_strict": {
    ru: "декор только из опыта карты",
    en: "decor only from map experience",
  },
  "zonegen.small_single": { ru: "Малая зона — один тип, до", en: "Small zone — one type, up to" },
  "zonegen.seed": { ru: "Сид", en: "Seed" },
  "zonegen.seed_roll": { ru: "Новый сид", en: "New seed" },
  "zonegen.random_recipe": { ru: "Случайный рецепт", en: "Random recipe" },

  // ─────────── Кнопки ───────────
  "zonegen.generate": { ru: "Сгенерировать", en: "Generate" },
  "zonegen.regenerate": { ru: "Перегенерировать", en: "Regenerate" },
  "zonegen.busy": { ru: "Генерируем…", en: "Generating…" },
  "zonegen.discard": { ru: "Забыть правки", en: "Forget edits" },
  "zonegen.discard_title": {
    ru: "Убрать из очереди правки, поставленные по этим клеткам",
    en: "Drop the queued edits made on these cells",
  },
  "zonegen.reset": { ru: "Сбросить", en: "Reset" },
  "zonegen.reset_title": {
    ru: "Снять выделение (правки в очереди останутся)",
    en: "Clear the selection (queued edits stay)",
  },
  "zonegen.hint_queue": {
    ru: "правки уходят в очередь кисти — выгружай кнопкой «Выгрузить» сверху.",
    en: "edits go to the brush queue — push them with “Publish” above.",
  },

  // ─────────── ИИ ───────────
  "zonegen.ai_placeholder": {
    ru: "Опиши зону: «болотистый лес с озёрами, немного скал»",
    en: "Describe the zone: “swampy forest with lakes, a few rocks”",
  },
  "zonegen.ai_compose": { ru: "Составить рецепт ИИ", en: "Compose recipe with AI" },
  "zonegen.ai_busy": { ru: "ИИ думает…", en: "AI is thinking…" },
  // Отказ сервера приходит ключом (см. humanError) — ключей ИИ на клиенте нет.
  "zonegen.ai_not_configured": { ru: "ИИ не настроен", en: "AI is not configured" },
  "zonegen.ai_note": { ru: "ИИ: {note}", en: "AI: {note}" },

  // ─────────── Отчёт и ошибки ───────────
  "zonegen.report": {
    ru: "Клеток: {cells} · занятых пропущено: {skipped} · декора: {decor}",
    en: "Cells: {cells} · occupied skipped: {skipped} · decor: {decor}",
  },
  "zonegen.report_single": {
    ru: "маленькая зона — один тип местности",
    en: "small zone — a single terrain",
  },
  "zonegen.report_by_terrain": { ru: "По местностям", en: "By terrain" },
  "zonegen.empty_selection": {
    ru: "Выдели клетки кистью «Биом»",
    en: "Select cells with the “Biome” brush",
  },
  "zonegen.too_many": {
    ru: "Зона больше {max} клеток — уменьши выделение",
    en: "The zone exceeds {max} cells — shrink the selection",
  },

  // ─────────── Выделение: кисть или прямоугольник ───────────
  "zonegen.sel_label": { ru: "Выделение", en: "Selection" },
  "zonegen.sel_brush": { ru: "Кисть", en: "Brush" },
  "zonegen.sel_rect": { ru: "Прямоугольник", en: "Rectangle" },
  "zonegen.rect_first": {
    ru: "Тапни первый угол — можно и за краем карты",
    en: "Tap the first corner — beyond the map edge works too",
  },
  "zonegen.rect_second": {
    ru: "Угол {q},{r} задан — тапни противоположный",
    en: "Corner {q},{r} set — tap the opposite one",
  },
  "zonegen.rect_too_big": {
    ru: "Прямоугольник на {n} клеток — больше {max} за раз нельзя",
    en: "That rectangle is {n} cells — at most {max} at a time",
  },
  "zonegen.brush_hint": {
    ru: "Мазок добавляет клетки, повторный по тем же — снимает; размер — в ряду «Размер»",
    en: "A stroke adds cells, a second stroke over them removes; size is in the “Size” row",
  },
  "zonegen.collapse": { ru: "Свернуть — карта под панелью", en: "Collapse — see the map" },
  "zonegen.expand": { ru: "Развернуть рецепт", en: "Expand the recipe" },
  "zonegen.scale_hint": {
    ru: "Размер пятна в клетках: 4 — рябь, 12 — пруды и рощи, 40 — материки",
    en: "Patch size in cells: 4 — ripple, 12 — ponds and groves, 40 — continents",
  },
  "zonegen.small_single_hint": {
    ru: "Зона меньше N клеток красится одним типом (жребий по весам): в 5 клетках пятен не нарисовать",
    en: "A zone under N cells gets a single terrain (weighted draw): no patches fit in 5 cells",
  },

  // ─────────── Сид фразой ───────────
  "zonegen.seed_placeholder": { ru: "число или фраза", en: "a number or a phrase" },
  "zonegen.seed_hint": {
    ru: "Можно фразой: «Северный архипелаг» — та же фраза даёт ту же зону",
    en: "A phrase works: “Northern archipelago” — the same phrase gives the same zone",
  },
  "zonegen.seed_value": { ru: "сид: {n}", en: "seed: {n}" },
  "zonegen.seed_copy": { ru: "Скопировать сид", en: "Copy the seed" },
  "zonegen.seed_copied": { ru: "Скопировано", en: "Copied" },
  "zonegen.seed_copy_failed": {
    ru: "Буфер недоступен — сид {n}, перепиши руками",
    en: "Clipboard is unavailable — the seed is {n}, copy it by hand",
  },
  "zonegen.warp": { ru: "Извилистость", en: "Waviness" },
  "zonegen.warp_hint": {
    ru: "0 % — пятна круглые, 100 % — берег рваный, с заливами и косами",
    en: "0% — round patches, 100% — a ragged shore with bays and spits",
  },

  // ─────────── Поселения ───────────
  "zonegen.settlement": { ru: "Поселения", en: "Settlements" },
  "zonegen.preset": { ru: "Тип", en: "Kind" },
  "zonegen.preset_camp": { ru: "Лагерь", en: "Camp" },
  "zonegen.preset_village": { ru: "Деревня", en: "Village" },
  "zonegen.preset_town": { ru: "Городок", en: "Town" },
  "zonegen.preset_port": { ru: "Порт", en: "Port" },
  // ─── Планировка: КАК стоят дома (24.09 — «хаотично раскидывает») ───
  "zonegen.layout_ring": { ru: "Кольцо", en: "Ring" },
  "zonegen.layout_cross": { ru: "Крест", en: "Cross" },
  "zonegen.layout_grid": { ru: "Кварталы", en: "Blocks" },
  "zonegen.layout_free": { ru: "Свободно", en: "Free" },
  "zonegen.layout_ring_hint": {
    ru: "площадь с ратушей, кольцо служб, дворы по краю",
    en: "a square with the town hall, a ring of services, yards along the edge",
  },
  "zonegen.layout_cross_hint": {
    ru: "две улицы через центр, дома вдоль них",
    en: "two streets through the centre, houses along them",
  },
  "zonegen.layout_grid_hint": {
    ru: "кварталы: ряды домов через улицу",
    en: "blocks: rows of houses split by streets",
  },
  "zonegen.layout_free_hint": {
    ru: "без плана — россыпь по пятну",
    en: "no plan — scattered across the patch",
  },

  "zonegen.set_count": { ru: "Сколько", en: "How many" },
  "zonegen.set_size": { ru: "Поперечник", en: "Diameter" },
  "zonegen.set_density": { ru: "Плотность", en: "Density" },
  "zonegen.set_road": { ru: "Дорога", en: "Road" },
  "zonegen.set_road_none": { ru: "без дороги", en: "no road" },
  "zonegen.set_built": { ru: "ставить достроенными", en: "place them finished" },
  "zonegen.set_built_hint": {
    ru: "сразу последняя ступень: постройка работает, игроку не надо достраивать",
    en: "top tier right away: the building works, the player needn’t finish it",
  },
  "zonegen.set_compose": { ru: "Собрать состав: {kind}", en: "Build the set: {kind}" },
  "zonegen.set_compose_title": {
    ru: "Заполнит список под выбранный тип: ратуша одна, таверна одна, дворы — в фон",
    en: "Fills the list for the chosen kind: one town hall, one tavern, yards as fill",
  },
  "zonegen.set_recompose": {
    ru: "Тип сменился — пересобрать состав под «{kind}»?",
    en: "The kind changed — rebuild the set for “{kind}”?",
  },
  "zonegen.set_recompose_do": { ru: "Пересобрать", en: "Rebuild" },
  "zonegen.set_buildings": { ru: "Состав", en: "Set" },
  "zonegen.set_totals": {
    ru: "обязательных: {n} · фон: {m} шаблонов",
    en: "required: {n} · fill: {m} templates",
  },
  "zonegen.set_clear": { ru: "Очистить", en: "Clear" },
  "zonegen.set_search": { ru: "поиск по имени", en: "search by name" },
  "zonegen.set_pcs_title": {
    ru: "сколько штук этой постройки в каждом поселении",
    en: "how many of this building in each settlement",
  },
  "zonegen.set_fill": { ru: "фон", en: "fill" },
  "zonegen.set_fill_title": {
    ru: "добивать этой постройкой остаток пятна",
    en: "pad the rest of the patch with this building",
  },
  "zonegen.set_effect_of": { ru: "поведение: {name}", en: "behaviour: {name}" },
  "zonegen.set_cols": {
    ru: "шт — сколько поставить в каждом поселении; фон — добивать остаток дворами",
    en: "pcs — how many to place in each settlement; fill — pad the rest with yards",
  },
  "zonegen.needs_config": {
    ru: "без настройки работать не будет — поставится пустой",
    en: "without its setup it won’t work — it will be placed empty",
  },
  "zonegen.set_none_picked": {
    ru: "состав пуст — поселений не будет",
    en: "the set is empty — there will be no settlements",
  },
  "zonegen.set_limit": {
    ru: "больше {max} построек в состав не влезет",
    en: "a set holds at most {max} buildings",
  },
  "zonegen.set_nothing": { ru: "ничего не нашлось", en: "nothing found" },
  "zonegen.set_report": {
    ru: "Поселений: {places} · построек: {buildings} · дорога: {road} кл.",
    en: "Settlements: {places} · buildings: {buildings} · road: {road} cells",
  },
  "zonegen.set_report_count": { ru: "Поселений: {places}", en: "Settlements: {places}" },
  "zonegen.set_report_by": { ru: "Поставлено", en: "Placed" },
  "zonegen.set_report_short": { ru: "не влезло: {n}", en: "didn’t fit: {n}" },

  // ─────────── Поведение построек (группы в списке) ───────────
  "zonegen.eff_none": { ru: "Просто дом", en: "Plain house" },
  "zonegen.eff_market": { ru: "Маркет", en: "Market" },
  "zonegen.eff_tavern": { ru: "Таверна", en: "Tavern" },
  "zonegen.eff_university": { ru: "Университет", en: "University" },
  "zonegen.eff_museum": { ru: "Музей", en: "Museum" },
  "zonegen.eff_warehouse": { ru: "Склад", en: "Warehouse" },
  "zonegen.eff_chambers": { ru: "Покои", en: "Chambers" },
  "zonegen.eff_boost": { ru: "БУСТ", en: "Boost" },
  "zonegen.eff_spellbook": { ru: "Столб заклинаний", en: "Spell pillar" },
  "zonegen.eff_oblivion": { ru: "Забвение", en: "Oblivion" },
  "zonegen.eff_leveltree": { ru: "Дерево уровней", en: "Level tree" },
  "zonegen.eff_watchtower": { ru: "Вышка", en: "Watchtower" },
  "zonegen.eff_shipyard": { ru: "Верфь", en: "Shipyard" },
  "zonegen.eff_sign": { ru: "Табличка", en: "Sign" },
  "zonegen.eff_town_hall": { ru: "Ратуша", en: "Town hall" },
  "zonegen.eff_field": { ru: "Грядка", en: "Field" },
  "zonegen.eff_mine": { ru: "Шахта", en: "Mine" },
  "zonegen.eff_portal": { ru: "Портал", en: "Portal" },
};
