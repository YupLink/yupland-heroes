import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// «Метеостанция» (владелец, 28.10.2026): здание замка из Ратуши, иконка у
// «Добычи» и окно погоды миров с шансами следующей смены. Отказ сервера
// (server/api/weather-station/*) — ключом, humanError переводит.
export const dict: Record<string, Entry> = {
  "wstation.title": { ru: "Метеостанция", en: "Weather station" },
  "wstation.rail": { ru: "Погода", en: "Weather" },
  "wstation.build": { ru: "Построить", en: "Build" },
  "wstation.built": { ru: "Построено", en: "Built" },
  "wstation.built_toast": { ru: "Метеостанция построена", en: "Weather station built" },
  "wstation.slot": { ru: "Нет места — улучши Ратушу", en: "No room — upgrade the Town Hall" },
  "wstation.need_level": { ru: "Нужна Ратуша {n}-го уровня", en: "Requires a level {n} Town Hall" },
  "wstation.takes_slot": { ru: "1 место в лимите зданий", en: "Takes 1 building slot" },
  "wstation.loading": { ru: "Загружаем погоду…", en: "Loading weather…" },
  "wstation.load_error": { ru: "Не удалось загрузить погоду", en: "Could not load the weather" },
  "wstation.retry": { ru: "Повторить", en: "Retry" },
  "wstation.empty": { ru: "Миров с погодой нет", en: "No worlds with weather" },
  "wstation.pct": { ru: "{n}\u00a0%", en: "{n}%" },
  "wstation.level.clear": { ru: "Ясно", en: "Clear" },
  "wstation.level.overcast": { ru: "Пасмурно", en: "Overcast" },
  "wstation.level.storm": { ru: "Шторм", en: "Storm" },
  "wstation.shamans": { ru: "Шаманов в хижине: {n}", en: "Shamans in the hut: {n}" },
  "wstation.ritual": { ru: "Обряд", en: "Ritual" },
  "wstation.ritual_go": { ru: "Провести · шаман → +{n} %", en: "Perform · shaman → +{n}%" },
  "wstation.ritual_ok": {
    ru: "Обряд проведён: +{n} % к смене погоды",
    en: "Ritual done: +{n}% for the next change",
  },
  "wstation.ritual_mine": { ru: "Ваш обряд: {what} +{n} %", en: "Your ritual: {what} +{n}%" },
  "wstation.votes": { ru: "Голоса шаманов:", en: "Shaman votes:" },
  "wstation.cancel": { ru: "Отмена", en: "Cancel" },
  "wstation.save": { ru: "Сохранить", en: "Save" },
  "wstation.rename": { ru: "Переименовать мир", en: "Rename world" },
  "wstation.renamed": { ru: "Мир переименован", en: "World renamed" },
  "wstation.hide": { ru: "Скрыть из станции", en: "Hide from the station" },
  "wstation.show": { ru: "Вернуть в станцию", en: "Show in the station" },
  "wstation.hidden": { ru: "скрыт", en: "hidden" },
  "wstation.target.clear": { ru: "Ясно", en: "Clear" },
  "wstation.target.overcast": { ru: "Пасмурно", en: "Overcast" },
  "wstation.target.storm": { ru: "Шторм", en: "Storm" },
  "wstation.target.warmer": { ru: "Теплее", en: "Warmer" },
  "wstation.target.colder": { ru: "Холоднее", en: "Colder" },
  "wstation.ritual_cannot": {
    ru: "Такая погода сейчас выпасть не может",
    en: "This weather can't come next",
  },
  "wstation.ritual_no_weather": { ru: "В этом мире нет погоды", en: "This world has no weather" },
  "wstation.ritual_too_late": {
    ru: "Погода уже сменилась — проведи обряд снова",
    en: "The weather already changed — perform the ritual again",
  },
  "wstation.ritual_already": {
    ru: "В этом мире обряд в эту смену уже был",
    en: "You already performed a ritual in this world this change",
  },
  "wstation.ritual_no_shaman": { ru: "Нет шамана в хижине", en: "No shaman in the hut" },
  "wstation.ritual_failed": {
    ru: "Обряд не удался — попробуй ещё раз",
    en: "The ritual failed — try again",
  },
  "wstation.not_built": {
    ru: "Сначала построй Метеостанцию в Ратуше",
    en: "Build the Weather station in the Town Hall first",
  },
};
