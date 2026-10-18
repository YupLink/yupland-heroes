// Условия турниров для игрока (вкладка «Условия» плашки): за что очки идут и за
// что нет — коротко, по пунктам (владелец, 05.10.2026: «не усложняй»). Пункты
// перечислены в lib/tournament/metricRules.ts.
export const dict = {
  "tour.rules.yes": { ru: "Засчитывается", en: "Counts" },
  "tour.rules.no": { ru: "Не засчитывается", en: "Doesn't count" },
  "tour.rules.join": { ru: "Очки — только после записи", en: "Points only after sign-up" },
  "tour.rules.tie": {
    ru: "Равный счёт — одно место, призы мест поровну",
    en: "Equal score — shared place, prizes split equally",
  },
  "tour.rules.damage.y1": { ru: "урон по монстрам и боссам", en: "damage to monsters and bosses" },
  "tour.rules.damage.n1": { ru: "сундуки на карте", en: "chests on the map" },
  "tour.rules.boss_kills.y1": {
    ru: "добил монстра или босса — 1 очко",
    en: "finished off a monster or boss — 1 point",
  },
  "tour.rules.boss_kills.n1": { ru: "бой без победы", en: "a fight without a win" },
  "tour.rules.gold.y1": { ru: "прибыль с продажи за золото", en: "profit from selling for gold" },
  "tour.rules.gold.y2": {
    ru: "продажа добытого, подарков и взятого со склада — вся выручка",
    en: "selling what you gathered, got as a gift or took from storage — all revenue",
  },
  "tour.rules.gold.n1": {
    ru: "золото с шахт, монстров, наград",
    en: "gold from mines, monsters, rewards",
  },
  "tour.rules.gold.n2": { ru: "продажа в убыток", en: "selling at a loss" },
  "tour.rules.gold.n3": {
    ru: "товар, накопленный до начала турнира",
    en: "goods stocked up before the tournament started",
  },
  "tour.rules.wood.y1": { ru: "лесопилка", en: "sawmill" },
  "tour.rules.wood.y2": { ru: "добыча с монстров и карты", en: "loot from monsters and the map" },
  "tour.rules.wood.y3": { ru: "брёвна от топора", en: "logs from an axe" },
  "tour.rules.wood.y4": { ru: "грядки", en: "fields" },
  "tour.rules.stone.y1": { ru: "каменная шахта", en: "stone mine" },
  "tour.rules.stone.y2": { ru: "добыча с монстров и карты", en: "loot from monsters and the map" },
  "tour.rules.stone.y3": { ru: "камни и руда от кирки", en: "stones and ore from a pickaxe" },
  "tour.rules.stone.y4": { ru: "грядки", en: "fields" },
  "tour.rules.res.n1": { ru: "покупки и оплата за товар", en: "purchases and payment for goods" },
  "tour.rules.res.n2": { ru: "склад, сундук, мешочек", en: "warehouse, chest, pouch" },
  "tour.rules.res.n3": {
    ru: "подарки, призы, возвраты, паки",
    en: "gifts, prizes, refunds, packs",
  },
  "tour.rules.res.n4": {
    ru: "выработка шахты и добыча до старта или записи",
    en: "mine output and loot from before the start or sign-up",
  },
  "tour.rules.chop.y1": {
    ru: "дерево, срубленное топором, — 1 очко",
    en: "a tree chopped with an axe — 1 point",
  },
  "tour.rules.chop.n1": { ru: "кирка", en: "pickaxe" },
  "tour.rules.steps.y1": {
    ru: "шаг по карте, и на корабле, — 1 очко",
    en: "a step on the map, by ship too — 1 point",
  },
  "tour.rules.steps.n1": { ru: "порталы", en: "portals" },
  "tour.rules.steps.n2": { ru: "посадка и высадка кнопкой", en: "boarding and leaving by button" },
  "tour.rules.step_energy.y1": { ru: "энергия на шаги", en: "energy spent on steps" },
  "tour.rules.step_energy.n1": {
    ru: "энергия на всё остальное",
    en: "energy spent on anything else",
  },
  "tour.rules.farm.y1": {
    ru: "1 очко в день за каждую шахту (23:59 UTC)",
    en: "1 point a day per mine (23:59 UTC)",
  },
  "tour.rules.farm.n1": { ru: "шахта, потерянная до 23:59", en: "a mine lost before 23:59" },
  "tour.rules.fish_catch.y1": {
    ru: "рыба, пойманная удочкой, — 1 очко за штуку",
    en: "a fish caught with a rod — 1 point each",
  },
  "tour.rules.fish_catch.y2": {
    ru: "улов, не влезший в рюкзак, — тоже",
    en: "a catch that didn't fit in the backpack counts too",
  },
  "tour.rules.fish_catch.n1": { ru: "купленная рыба", en: "bought fish" },
  "tour.rules.fish_catch.n2": {
    ru: "рыба с грядки, со склада, из сундука и мешочка",
    en: "fish from fields, storage, chests and pouches",
  },
  "tour.rules.fish_sell.y1": {
    ru: "своя рыба — пойманная удочкой или выращенная на своей грядке, и до старта тоже, — 1 очко за штуку",
    en: "your own fish — caught with a rod or grown on your field, even before the start — 1 point each",
  },
  "tour.rules.fish_sell.y2": {
    ru: "своя — продажа маркету и ратуше за что угодно",
    en: "your own — selling to a market or town hall for anything",
  },
  "tour.rules.fish_sell.y3": {
    ru: "купленная самим, и до старта тоже, — только проданная дороже, чем куплена, за ту же валюту и в плюсе по всем покупкам",
    en: "fish you bought, even before the start — only if sold for more than you paid, in the same currency, and in profit across all your purchases",
  },
  "tour.rules.fish_sell.n1": {
    ru: "купленная, проданная не дороже, за другую валюту или в минусе",
    en: "bought fish sold for the same or less, for another currency, or at an overall loss",
  },
  "tour.rules.fish_sell.n2": {
    ru: "рыба другого игрока: склад, сундук, мешочек, аукцион, его грядка",
    en: "another player's fish: storage, chest, pouch, auction, their field",
  },
  "tour.rules.fish_sell.n3": {
    ru: "продажа до записи или до старта турнира",
    en: "sales before you joined or before the tournament started",
  },
  "tour.rules.fish_sell.n4": { ru: "обмен рыбы на зелья", en: "trading fish for potions" },
  "tour.rules.fish_sell.n5": {
    ru: "рыба из бокса и выменянная на товар",
    en: "fish from boxes or traded for goods",
  },
  "tour.rules.potion_drink.y1": {
    ru: "выпитое зелье скорости — 1 очко за штуку",
    en: "a speed potion drunk — 1 point each",
  },
  "tour.rules.potion_drink.y2": {
    ru: "купленное и сваренное самим — из любой рыбы и вёдер, и до старта тоже",
    en: "bought or brewed yourself — from any fish and buckets, even before the start",
  },
  "tour.rules.potion_drink.items": { ru: "зелья: {items}", en: "potions: {items}" },
  "tour.rules.potion_drink.n1": {
    ru: "зелье другого игрока: склад, сундук, мешочек, аукцион",
    en: "another player's potion: storage, chest, pouch, auction",
  },
  "tour.rules.potion_drink.n2": { ru: "другие зелья", en: "other potions" },
  "tour.rules.potion_drink.n3": {
    ru: "выпитое до записи или до старта турнира",
    en: "potions drunk before you joined or before the tournament started",
  },
} as const;
