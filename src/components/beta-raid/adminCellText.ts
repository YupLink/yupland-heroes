// Тексты окна клетки и панели режима бога — на двух языках.
//
// Половинчатый перевод («одна фраза по-английски, десять по-русски») хуже
// обеих крайностей: админ перестаёт верить надписям. Соседний adminBrushText
// уже говорит о судьбе правок двумя языками — здесь та же история и тот же
// приём: строки живут рядом с кистью, а не в общем словаре игрока.
//
// Русский — по умолчанию: язык интерфейса приходит из настроек игрока, и всё,
// что не «en», считаем русским.
import type { Lang } from "@/lib/store";

export type GodText = ReturnType<typeof godText>;

export function godText(lang: Lang) {
  const ru = lang !== "en";
  const p = (r: string, e: string) => (ru ? r : e);

  return {
    // ── Окно клетки ──
    cellTitle: (q: number, r: number) =>
      ru ? `Админ · клетка ${q}, ${r}` : `Admin · cell ${q}, ${r}`,
    liveEdit: p("Правка на живой карте", "Editing the live map"),
    close: p("Закрыть", "Close"),
    publish: p("Выгрузить", "Upload"),

    // ── Строки состава ──
    rowTerrain: p("Местность", "Terrain"),
    rowRoad: p("Дорога", "Road"),
    rowDecor: p("Декор", "Decor"),
    rowObject: p("Объект", "Object"),
    /** Беглец: объект своего слоя, стоящий на клетке (server runners.ts). */
    rowRunner: p("Беглец", "Runaway"),
    runnerHint: p(
      "прибежал сюда сам: прохода не закрывает, правками клетки не убирается",
      "ran here on its own: does not block the tile and cell edits will not remove it",
    ),
    runnerRemoved: p("Беглец убран", "Runaway removed"),
    rowBuilding: p("Постройка", "Building"),
    rowShip: p("Корабль", "Ship"),
    rowPlayers: p("Игроки", "Players"),
    nothingHere: p("На клетке ничего нет", "Nothing on this tile"),
    remove: p("убрать", "remove"),
    /** Слой правили кистью, но на сервер он ещё не уехал. */
    notPublished: p("не выгружено", "not uploaded"),
    // ── Купол глухого тумана ──
    // Отдельная строка состава, а не приписка к названию местности: под
    // куполом местность своя и настоящая, купол лежит поверх неё.
    rowDome: p("Купол", "Dome"),
    domeOn: p("под глухим туманом", "under the dead fog"),
    domeHint: p(
      "игроку клетка не откроется и не пропустит; всё под ней цело",
      "players never reveal or enter it; everything under it is intact",
    ),
    domeLift: p("снять купол", "lift the dome"),
    /** Кисть купола в палитре «Местность». Одна кнопка — тумблер по первой
     *  клетке мазка (paint-style). Второй сентинел оставлен ради совместимости
     *  импортов, но в UI не используется. */
    voidBrushOn: p("Туман", "Fog"),
    voidBrushOff: p("Туман · снять", "Fog · lift"),
    /** Ярлык кисти «выделение под биом-генератор» — короткий, чтобы влезло. */
    biomeBrushOn: p("Биом", "Biome"),

    // ── Объект ──
    alive: p("жив", "alive"),
    defeated: p("добыт", "taken"),
    extinguish: p("погасить", "kill"),
    revive: p("оживить", "revive"),
    configure: p("настроить", "configure"),
    /** id объекта не разобрать — полную форму открыть не по чему. */
    noEditor: p("вид не разобрать — без формы", "unknown kind — no form"),

    // ── Постройка ──
    tierOf: (tier: number, tiers: number | string) =>
      ru ? `тир ${tier} из ${tiers}` : `tier ${tier} of ${tiers}`,
    tiersUnknown: p("Сколько у постройки тиров — неизвестно", "The tier count is unknown"),

    // ── Корабль ──
    shipsCount: (n: number) => (ru ? `${n} шт.` : `${n} pcs`),
    launchShip: p("спустить корабль", "launch a ship"),
    launchBigShip: p("большой корабль", "big ship"),
    shipPlaced: p("Корабль спущен", "Ship launched"),
    bigShipPlaced: p("Большой корабль спущен", "Big ship launched"),
    shipRemoved: p("Корабль убран", "Ship removed"),
    /** Сервер ещё не подтвердил, что клетка — вода. */
    waterChecking: p("проверяем воду на сервере…", "checking the water on the server…"),
    waterUnconfirmed: p(
      "состав не подтверждён — корабль не обещаем",
      "tile not confirmed — no ship promised",
    ),
    waterNotPublished: p(
      "вода ещё не выгружена: сначала «Выгрузить»",
      "the water is not uploaded yet: press Upload first",
    ),

    // ── Ответ сервера ──
    cellFailed: p(
      "Состав не подтверждён: сервер не ответил. Показано по кэшу карты — живость, настройки и игроки могут быть не те.",
      "Tile not confirmed: the server did not answer. Shown from the map cache — liveness, settings and players may differ.",
    ),
    retry: p("ещё раз", "retry"),
    detailsComing: p("Подробности едут с сервера", "Details are on their way"),

    // ── Табличка ──
    signTitle: p("Послание героям", "Message to heroes"),
    signPlaceholder: p("Здесь был Юпик…", "Yupik was here…"),
    signSaved: p("Текст записан в правки", "Text added to the edits"),
    signQueued: p("Текст в правках — осталось выгрузить", "Text is queued — upload it"),
    signSave: p("Записать текст", "Save text"),

    // ── Панель режима ──
    modeInspect: p("Правка", "Edit"),
    modePaint: p("Кисть", "Brush"),
    modeErase: p("Ластик", "Eraser"),
    modeMerge: p("Объединить", "Merge"),
    hintMerge: p(
      "Тап набирает соседние клетки в блок; тап по блоку — масштаб и разъединение",
      "Tap to pick adjacent tiles into a block; tap a block for scale and split",
    ),
    hintInspect: p(
      "Тап открывает клетку: правится то, что на ней уже стоит",
      "A tap opens the tile: you edit what already stands there",
    ),
    hintPaint: (name: string) => (ru ? `Тап ставит: ${name}` : `A tap places: ${name}`),
    hintVoidOn: p("Тап накрывает клетку куполом", "A tap covers the tile with the dome"),
    hintVoidOff: p("Тап снимает купол", "A tap lifts the dome"),
    hintSpawn: p(
      "Тап ставит точку спавна из шаблона",
      "A tap places a spawn point from the template",
    ),
    /** Подсказка для ген-кисти: краску клетка не получает — только пометку. */
    hintGen: p(
      "Тап помечает клетки для биом-генератора",
      "A tap marks tiles for the biome generator",
    ),
    hintPickAsset: p("Выбери, чем красить", "Pick what to paint with"),
    hintErase: p(
      "Тап снимает всё, кроме местности; свою правку — отменяет",
      "A tap clears everything but terrain; your own edit it undoes",
    ),
    /** Тап не сделал ничего — говорим почему. */
    pickAssetFirst: p(
      "Сначала выбери в палитре, чем красить",
      "Pick something in the palette first",
    ),
    /** Режимы ластика (eraseTarget.ts). */
    eraseTargets: {
      top: p("Сверху", "Top layer"),
      object: p("Объект", "Object"),
      decor: p("Декор", "Decor"),
      building: p("Постройка", "Building"),
      road: p("Дорога", "Road"),
      terrain: p("Местность", "Terrain"),
    },
    hintEraseOnly: (what: string) =>
      p(`Тап снимает только: ${what.toLowerCase()}`, `A tap clears only: ${what.toLowerCase()}`),
    hintEraseTerrain: p(
      "Тап стирает клетку целиком — с местностью",
      "A tap wipes the whole tile — terrain included",
    ),
    eraseNothing: p("Здесь нечего стирать этим ластиком", "Nothing here for this eraser"),
    eraseEmpty: p(
      "Стирать нечего: на клетке только местность",
      "Nothing to erase: the tile has terrain only",
    ),
    /** Купол и дорога ложатся ПОВЕРХ земли — на голой клетке сервер их отобьёт. */
    needGround: p(
      "Сначала поставь местность — это кладётся поверх неё",
      "Place terrain first — this goes on top of it",
    ),

    // ── Туман войны (только у админа) ──
    fogRevealOn: p("Очистить туман войны", "Clear fog of war"),
    fogRevealOff: p("Вернуть туман", "Restore fog"),
    fogRevealHint: p(
      "Карта открыта целиком — видишь только ты",
      "The whole map is open — only you see it",
    ),
    fogHiddenHint: p(
      "Карта под туманом, как у игрока",
      "The map is under fog, same as a player sees it",
    ),
    fogRevealedToast: p("Карта открыта — видишь только ты", "Map revealed — only you see it"),
    fogRestoredToast: p("Туман вернулся", "Fog is back"),

    // ── Массовая раздача ──
    // Вход в окно «Раздать заново» стоит и здесь: карту правят из режима бога,
    // а за раздачей до сих пор ходили в общий редактор карт — через выход из
    // рейда, меню админки и все её подгрузки.
    giveaway: p("Раздать", "Scatter"),
    giveawayTitle: p(
      "Раздать заново: снять отработавшие объекты и поставить новых",
      "Scatter anew: take spent objects off the map and place new ones",
    ),
    /** Почему кнопка не нажимается: раздача и накопленный мазок пишут в одни и
     *  те же клетки, и невыгруженный ластик стёр бы свежий объект. */
    giveawayBlocked: p(
      "Сначала выгрузи правки: раздача пишет в те же клетки",
      "Upload your edits first: the scatter writes to the same tiles",
    ),

    // Создание объекта прямо с карты: раньше за новым боссом ходили в общий
    // редактор карт и возвращались обратно тем же длинным маршрутом.
    create: p("Создать", "Create"),
    createTitle: p(
      "Создать объект: имя, картинки, характеристики, способности и награды",
      "Create an object: name, images, stats, abilities and rewards",
    ),
    createBlocked: p(
      "Сначала выгрузи правки: новый объект появится в палитре после них",
      "Upload your edits first: the new object shows up in the palette after them",
    ),

    // ── Размер кисти ──
    brushSize: p("Размер", "Size"),

    // ── Забыть накопленное ──
    forgetTitle: p("Забыть накопленное", "Discard the queue"),
    forgetAsk: (n: number) => (ru ? `Точно забыть ${n}?` : `Discard ${n}?`),
    forgetWarn: p(
      "Правки пропадут без отправки — тапни ещё раз",
      "The edits will be lost unsent — tap again",
    ),

    // ── Палитра ──
    loadingAssets: p("Загружаем…", "Loading…"),
    noAssets: p("Ничего нет", "Nothing here"),
    kinds: {
      terrain: p("Местность", "Terrain"),
      road: p("Дороги", "Roads"),
      decoration: p("Декор", "Decor"),
      chest: p("Сундук / монетка", "Chest / coin"),
      artifact: p("Артефакт", "Artifact"),
      boss: p("Босс", "Boss"),
      building: p("Постройка", "Building"),
    },

    // ── Полная форма объекта ──
    objectLoading: p("Читаем настройки объекта…", "Reading the object settings…"),
    tplMissing: p("Шаблон объекта не найден:", "Object template not found:"),
    tplMissingWhy: p(
      "Форму не открываем: сохранение увезло бы на клетку значения по умолчанию поверх настоящих.",
      "The form stays shut: saving would push default values over the real ones.",
    ),
  };
}
