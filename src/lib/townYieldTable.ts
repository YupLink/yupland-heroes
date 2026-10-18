// Что растёт вокруг ратуши: товар ↔ местность и декор (владелец, 05.10.2026 —
// таблица «Связки товар — местность», PDF на рабочем столе владельца).
//
// Шанс — доля клеток местности, где товар есть; объём — штук в сутки с такой
// клетки (диапазон, берём середину). Декор — штук в сутки за каждый на карте.
// Ключи — id шаблонов (имена переименовывают, id остаются). Группа местностей
// задаётся через «@группа»; своя местность в строке главнее группы.
// «fish» — рыба: делится на виды по долям улова рыбалки (fishing_config).

/** Группы местностей — как в таблице владельца. */
export const TERRAIN_GROUPS: Record<string, string[]> = {
  "@луга": [
    "terrain_A5WcpQq_bW", // трава
    "terrain_QArF-OKH-s", // трава с холмами
    "terrain_8I8soK3-Xb", // Земля Единорогов
    "terrain_fDdsG2i3V8", // Земля Юпиков
    "terrain_UJMygrrDNQ", // Пересеченная местность
    "terrain_yDE29q-x6w", // Город Кабанов
  ],
  "@поля": [
    "terrain_WOvWdziRlw", // Грядка
    "terrain_MENBAOYlXP", // Грядка (2)
    "terrain_toViA4uxnB", // Грядка (3)
    "terrain_gQXbU6oZ7Z", // Грядки
    "terrain_-81Z6XbMKf", // Гречневые земли
    "terrain_12vgPS28MA", // Поле Гречи
  ],
  "@север": ["terrain_n6vNTT3B9G", "terrain_qIyePIPDqv"], // Снег, Мерзлота
  "@пустыня": ["terrain_vGe03oPjd7", "terrain_kcH1XMaddF"], // Пустыня, Жаркая пустыня
  "@юг": ["terrain_2_nAEYVpSF", "terrain_KwSlOfK9jO"], // Южный, Изобилия
  "@горы": ["terrain_jPXzH2S_vH", "terrain_OWKn1-lgiH"], // Горы, Высокогорье
  "@магия": [
    "terrain_7w9uHCgPPM", // Магическая земля
    "terrain_mkhXTJu43Q", // Безумные земли
    "terrain_QSdi4Q837x", // Радуга
    "terrain_A5JqlzR-QM", // Небеса
  ],
  "@соты": ["terrain_lQqHUKSTXM", "terrain_6niaEJBB37"], // Соты, Медовые соты
};

const T = {
  dry: "terrain_zZdeQieTB5", // Сухая Трава
  swamp: "terrain_7Lol4KUhOE", // Болота
  water: "terrain_HkP00zwDo-", // Вода
  ocean: "terrain_pRlK22YnWr", // Океан
  dungeon: "terrain_OqyagiM-7J", // Подземелье Дракона
  dragons: "terrain_00oVuY8fMP", // Земля Драконов
  unicorns: "terrain_8I8soK3-Xb", // Земля Единорогов
  boars: "terrain_yDE29q-x6w", // Город Кабанов
  buckwheat: "terrain_-81Z6XbMKf", // Гречневые земли
  snow: "terrain_n6vNTT3B9G", // Снег
  frost: "terrain_qIyePIPDqv", // Мерзлота
  plenty: "terrain_KwSlOfK9jO", // Изобилия
  madness: "terrain_mkhXTJu43Q", // Безумные земли
  rainbow: "terrain_QSdi4Q837x", // Радуга
};

export type YieldRow = {
  /** Свой товар (cst_…) или «fish». */
  item: string;
  /** Шанс 0…1 по местности или «@группе». */
  land: Record<string, number>;
  /** Объём в сутки с клетки, где товар есть. */
  vol: [number, number];
  /** Декор: id шаблонов и объём в сутки за каждый. */
  decor: Array<{ ids: string[]; vol: [number, number] }>;
};

const PRORUB = [
  "decoration_kZqRzIyCWb",
  "decoration__dX0sBDiGd",
  "decoration_ZRFlQB2SEv",
  "decoration_QSUuClQyLQ",
  "decoration_R9K3Qfn_hS",
];
const COWS = [
  "decoration_GLYFA8ckwQ",
  "decoration_2nr45VvXHb",
  "decoration_W_3rRoohAf",
  "decoration_Pqq3EzIaVo",
];
const MOUNTAINS = [
  "decoration__pWmVvs99j",
  "decoration_FYgPYLITrJ",
  "decoration_h5kheMrtl-",
  "decoration_XCqEz6J-zU",
  "decoration_1pWEaGCP-v", // Снежная гора
];
const OAK = "decoration_wnfmRe6dly";

const row = (
  item: string,
  land: Record<string, number>,
  vol: [number, number],
  decor: YieldRow["decor"] = [],
): YieldRow => ({ item, land, vol, decor });
const d = (ids: string[], vol: [number, number]) => ({ ids, vol });

export const YIELD_TABLE: YieldRow[] = [
  // Еда
  row(
    "cst_7ce4i4dx3oio",
    { "@поля": 0.3, "@луга": 0.15 },
    [0.5, 1],
    [d(["decoration_Ez9DnDjP5B"], [1, 2])],
  ), // Пшеница
  row(
    "cst_r0hwiwq7m4hb",
    { [T.buckwheat]: 0.4, "@поля": 0.2, "@луга": 0.1 },
    [0.5, 1],
    [
      d(
        [
          "decoration_hwydtv3r8s",
          "decoration_hwR8qC5304",
          "decoration_eDIWZYjiaL",
          "decoration_e74BewiPWj",
        ],
        [1, 2],
      ),
    ],
  ), // 5кг гречи
  row(
    "cst_so10bgce3tt7",
    { "@поля": 0.3, "@луга": 0.15, "@юг": 0.1 },
    [0.5, 1],
    [d(["decoration_W-RY47aW_d"], [1, 2])],
  ), // Помидоры
  row(
    "cst_m3nxv79fwdmb",
    { "@поля": 0.25, "@луга": 0.1 },
    [0.5, 1],
    [d(["decoration_sihi4Wz9AT"], [1, 2])],
  ), // Морковка
  row(
    "cst_npbej44tjvtc",
    { [T.unicorns]: 0.2, "@луга": 0.1 },
    [0.5, 1],
    [d(["decoration_ULRQzgZR0G"], [1, 2])],
  ), // Яблоко
  row("cst_bs1mzltn627t", { "@луга": 0.15, [T.dry]: 0.05 }, [0.5, 1], [d(COWS, [2, 3])]), // Молоко
  row(
    "cst_e8xu98eva5si",
    { [T.boars]: 0.2, "@луга": 0.1 },
    [0.3, 0.6],
    [d([OAK, "decoration_Bg_DQI4kjP"], [1, 2])],
  ), // Мешок Желудей
  row(
    "cst_yofa9yu5aepo",
    { "@луга": 0.1, [T.dry]: 0.05, "@горы": 0.05 },
    [0.5, 1],
    [d(["decoration_EWu54v0F_L"], [1, 2]), d(["decoration_HtJJ59lSzw"], [2, 4])],
  ), // Еловая Шишка
  row(
    "cst_1i90lt8xpvv8",
    { [T.snow]: 0.4, [T.frost]: 0.2 },
    [0.5, 1],
    [d(["decoration_KplgrQCWpe"], [1, 2])],
  ), // Зимние Огурцы
  row(
    "cst_dhwbu2xna349",
    { [T.snow]: 0.2, [T.frost]: 0.15 },
    [0.5, 1],
    [d(["decoration_DmliXWfza-", "decoration_qL7d80Ms_I"], [1, 2])],
  ), // Зимняя Еловая Шишка
  row(
    "cst_i3fhoad96zdn",
    { "@юг": 0.25, "@пустыня": 0.05 },
    [0.5, 1],
    [d(["decoration_PQsMdXnXPT"], [1, 2])],
  ), // Банан
  row(
    "cst_2utao8xzcxlz",
    { "@юг": 0.15, "@пустыня": 0.1 },
    [0.3, 0.6],
    [d(["decoration_KfIHiA2P6Z"], [1, 2])],
  ), // Пальмовое масло
  row(
    "fish",
    { [T.water]: 0.4, [T.ocean]: 0.2, [T.swamp]: 0.1 },
    [0.5, 1],
    [d([...PRORUB, "decoration_Us2c8pfsbO"], [1, 2])],
  ), // Рыба
  row(
    "cst_ay6u4pbdlvwl",
    { "@соты": 0.4, "@луга": 0.03 },
    [0.5, 1],
    [d(["decoration_fBjaTHTdGw"], [1, 2])],
  ), // Банка меда
  row(
    "cst_3vq0rcp4sv4x",
    { [T.water]: 1, [T.swamp]: 0.5 },
    [1, 2],
    [d(["decoration_yj2FSpXn3R"], [2, 3])],
  ), // Ведро воды
  row("cst_x4igtuarw86c", { [T.swamp]: 0.2, "@луга": 0.05, "@горы": 0.05 }, [0.3, 0.6]), // Набор трав
  row("cst_sgkt7wrp2y9n", { "@магия": 0.2 }, [0.5, 1], [d(["decoration_c3WqKCLQWI"], [1, 2])]), // Магическая шишка
  row(
    "cst_plnb53k8v5dm",
    { [T.madness]: 0.2, "@магия": 0.05 },
    [0.3, 0.6],
    [d(["decoration_E8ZPo0MFHl"], [1, 2])],
  ), // Магическая пыльца
  // Сырьё
  row("cst_wtza7b6iq7va", { "@луга": 0.15 }, [0.5, 1], [d([OAK], [1, 2])]), // Бревна Дуба
  row(
    "cst_8hnwx0g9yoq0",
    { [T.dry]: 0.2, "@север": 0.05 },
    [0.5, 1],
    [d(["decoration_wOE2Ohn3pG"], [1, 1])],
  ), // Лиственница
  row("cst_v7n1c4rdw7on", { "@луга": 0.03 }, [0.3, 0.5], [d(["decoration__3pmVmcZ3H"], [1, 3])]), // Вековое дерево
  row(
    "cst_05bvno59cvth",
    { "@пустыня": 0.1, "@юг": 0.1 },
    [0.5, 1],
    [d(["decoration_PcRPAxQoeW"], [1, 2])],
  ), // Баобаб
  row(
    "cst_f4ai8iucbsty",
    { [T.unicorns]: 0.1 },
    [0.3, 0.6],
    [d(["decoration_l4W0lO41_a"], [1, 2])],
  ), // Белый дуб
  row("cst_enln93ubvhsn", { [T.rainbow]: 0.2 }, [0.3, 0.6], [d(["decoration_CApgEegGGo"], [1, 2])]), // Радужные
  row(
    "cst_izilsngrki5v",
    { "@горы": 0.25, [T.dungeon]: 0.1, [T.dragons]: 0.1 },
    [0.5, 1],
    [d(MOUNTAINS, [1, 1])],
  ), // Горная Руда
  row("cst_xefj7vewkq11", { "@пустыня": 0.4 }, [1, 2], [d(["decoration_SCZrWVj44L"], [2, 5])]), // Пустынный Песок
  row("cst_fciu273j48lp", { [T.plenty]: 0.2 }, [0.3, 0.5], [d(["decoration_qzotgzHbYR"], [1, 1])]), // Монетки изобилия
  row(
    "cst_0chsk0wpqt2b",
    { [T.plenty]: 0.05, "@горы": 0.02 },
    [0.2, 0.5],
    [d(["decoration_Is9VPNEWdZ"], [1, 1])],
  ), // Слиток золота
];
