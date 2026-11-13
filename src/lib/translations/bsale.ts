import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Продажа построек (lib/buildingSale): кнопка в рюкзаке, окно установки, отказы
// сервера (bsale.*) и подписи формы товара «Постройка».
export const dict: Record<string, Entry> = {
  "bsale.put": { ru: "Поставить", en: "Place" },
  "bsale.title": { ru: "Поставить постройку", en: "Place a building" },
  "bsale.placed": { ru: "Постройка поставлена", en: "Building placed" },
  "bsale.cells_failed": { ru: "Не удалось проверить клетки", en: "Couldn't check the cells" },
  "bsale.far": {
    ru: "Слишком далеко — до 3 клеток от героя",
    en: "Too far — up to 3 cells from the hero",
  },
  "bsale.no_cell": { ru: "Здесь нет земли", en: "There's no land here" },
  "bsale.void": { ru: "Под глухим туманом не строят", en: "Can't build under the dome" },
  "bsale.water": { ru: "На воде не строят", en: "Can't build on water" },
  "bsale.castle": {
    ru: "Грядки и земля замка — не для построек",
    en: "Gardens and castle land can't hold a building",
  },
  "bsale.road": { ru: "На дороге не строят", en: "Can't build on a road" },
  "bsale.built": { ru: "Здесь уже постройка", en: "There's a building here already" },
  "bsale.decor": {
    ru: "Здесь декор — сначала расчисти клетку",
    en: "There's decoration here — clear the cell first",
  },
  "bsale.object": {
    ru: "Здесь что-то лежит или стоит",
    en: "Something is already here",
  },
  "bsale.hero": { ru: "Здесь стоит герой", en: "A hero is standing here" },
  "bsale.runner": { ru: "Здесь бродит моб", en: "A monster is wandering here" },
  "bsale.chest": { ru: "Здесь сундук", en: "There's a chest here" },
  "bsale.bag": { ru: "Здесь лежит мешочек", en: "There's a bag here" },
  "bsale.vein": { ru: "Здесь жила — она для шахты", en: "There's a vein here — it's for a mine" },
  "bsale.near_mine": {
    ru: "Вплотную к шахте строить нельзя",
    en: "Can't build right next to a mine",
  },
  "bsale.banned": {
    ru: "Эту постройку ставить нельзя",
    en: "This building can't be placed",
  },
  "bsale.spawn": {
    ru: "Здесь появляются мобы — строить нельзя",
    en: "Monsters respawn here — can't build",
  },
  "bsale.no_item": { ru: "Постройки в рюкзаке нет", en: "No building in the backpack" },
  "bsale.not_builder_world": {
    ru: "Ставить можно только в Мире строителей",
    en: "Buildings can be placed only in the Builders' World",
  },
  "bsale.busy": { ru: "Не получилось — попробуй ещё раз", en: "Didn't work — try again" },
  "bsale.not_owner": {
    ru: "Это не твоя постройка",
    en: "This isn't your building",
  },
  "bsale.not_sign": { ru: "Это не табличка", en: "This isn't a sign" },
  "bsale.dis_workers": {
    ru: "Урожай фермы некуда вывезти — нужен склад рядом",
    en: "The farm's harvest has nowhere to go — a warehouse nearby is needed",
  },
  "bsale.dis_goods": {
    ru: "На складе лежат товары — сначала их забирают",
    en: "The warehouse still holds goods — take them out first",
  },
  "bsale.dismantle": { ru: "Разобрать", en: "Dismantle" },
  "bsale.dismantle_sure": { ru: "Точно разобрать?", en: "Dismantle for sure?" },
  "bsale.dismantled": { ru: "Постройка разобрана", en: "Building dismantled" },
  "bsale.sign_placeholder": { ru: "Что написать на табличке", en: "What to write on the sign" },
  "bsale.sign_save": { ru: "Сохранить", en: "Save" },
  "bsale.sign_saved": { ru: "Надпись сохранена", en: "Text saved" },
};
