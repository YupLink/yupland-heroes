import elvenPreview from "./assets/town-hall-decor/elven/scene.webp";
import elvenItem0 from "./assets/town-hall-decor/elven/bench.webp";
import elvenItem1 from "./assets/town-hall-decor/elven/bench-corner.webp";
import elvenItem2 from "./assets/town-hall-decor/elven/lamp.webp";
import elvenItem3 from "./assets/town-hall-decor/elven/tree.webp";
import elvenItem4 from "./assets/town-hall-decor/elven/flowerbed.webp";
import elvenItem5 from "./assets/town-hall-decor/elven/fountain.webp";
import elvenItem6 from "./assets/town-hall-decor/elven/path.webp";
import elvenItem7 from "./assets/town-hall-decor/elven/territory-ground.webp";
import elvenItem8 from "./assets/town-hall-decor/elven/territory-wall.webp";
import winterPreview from "./assets/town-hall-decor/winter/scene.webp";
import winterItem0 from "./assets/town-hall-decor/winter/bench.webp";
import winterItem1 from "./assets/town-hall-decor/winter/bench-corner.webp";
import winterItem2 from "./assets/town-hall-decor/winter/lamp.webp";
import winterItem3 from "./assets/town-hall-decor/winter/tree.webp";
import winterItem4 from "./assets/town-hall-decor/winter/flowerbed.webp";
import winterItem5 from "./assets/town-hall-decor/winter/fountain.webp";
import winterItem6 from "./assets/town-hall-decor/winter/path.webp";
import winterItem7 from "./assets/town-hall-decor/winter/territory-ground.webp";
import winterItem8 from "./assets/town-hall-decor/winter/territory-wall.webp";
import infernalPreview from "./assets/town-hall-decor/infernal/scene.webp";
import infernalItem0 from "./assets/town-hall-decor/infernal/bench.webp";
import infernalItem1 from "./assets/town-hall-decor/infernal/bench-corner.webp";
import infernalItem2 from "./assets/town-hall-decor/infernal/lamp.webp";
import infernalItem3 from "./assets/town-hall-decor/infernal/tree.webp";
import infernalItem4 from "./assets/town-hall-decor/infernal/flowerbed.webp";
import infernalItem5 from "./assets/town-hall-decor/infernal/fountain.webp";
import infernalItem6 from "./assets/town-hall-decor/infernal/path.webp";
import infernalItem7 from "./assets/town-hall-decor/infernal/territory-ground.webp";
import infernalItem8 from "./assets/town-hall-decor/infernal/territory-wall.webp";
import buckwheatPreview from "./assets/town-hall-decor/buckwheat/scene.webp";
import buckwheatItem0 from "./assets/town-hall-decor/buckwheat/bench.webp";
import buckwheatItem1 from "./assets/town-hall-decor/buckwheat/bench-corner.webp";
import buckwheatItem2 from "./assets/town-hall-decor/buckwheat/lamp.webp";
import buckwheatItem3 from "./assets/town-hall-decor/buckwheat/tree.webp";
import buckwheatItem4 from "./assets/town-hall-decor/buckwheat/flowerbed.webp";
import buckwheatItem5 from "./assets/town-hall-decor/buckwheat/fountain.webp";
import buckwheatItem6 from "./assets/town-hall-decor/buckwheat/sculptural-path.webp";
import buckwheatItem7 from "./assets/town-hall-decor/buckwheat/sculptural-ground.webp";
import buckwheatItem8 from "./assets/town-hall-decor/buckwheat/sculptural-wall.webp";
import celestialPreview from "./assets/town-hall-decor/celestial/scene.webp";
import celestialItem0 from "./assets/town-hall-decor/celestial/bench.webp";
import celestialItem1 from "./assets/town-hall-decor/celestial/bench-corner.webp";
import celestialItem2 from "./assets/town-hall-decor/celestial/lamp.webp";
import celestialItem3 from "./assets/town-hall-decor/celestial/tree.webp";
import celestialItem4 from "./assets/town-hall-decor/celestial/flowerbed.webp";
import celestialItem5 from "./assets/town-hall-decor/celestial/fountain.webp";
import celestialItem6 from "./assets/town-hall-decor/celestial/path.webp";
import celestialItem7 from "./assets/town-hall-decor/celestial/ground.webp";
import celestialItem8 from "./assets/town-hall-decor/celestial/wall.webp";
export const townHallDecorPreviews: Record<string, { preview: string; items: {name: string; art: string}[] }> = {
  "Эльфийский": { preview: elvenPreview, items: [{ name: "Лавочка", art: elvenItem0 }, { name: "Угловая лавочка", art: elvenItem1 }, { name: "Фонарь", art: elvenItem2 }, { name: "Дерево", art: elvenItem3 }, { name: "Клумба", art: elvenItem4 }, { name: "Фонтан", art: elvenItem5 }, { name: "Дорожки", art: elvenItem6 }, { name: "Земля", art: elvenItem7 }, { name: "Ограда", art: elvenItem8 }] },
  "Зимний": { preview: winterPreview, items: [{ name: "Лавочка", art: winterItem0 }, { name: "Угловая лавочка", art: winterItem1 }, { name: "Фонарь", art: winterItem2 }, { name: "Дерево", art: winterItem3 }, { name: "Клумба", art: winterItem4 }, { name: "Фонтан", art: winterItem5 }, { name: "Дорожки", art: winterItem6 }, { name: "Земля", art: winterItem7 }, { name: "Ограда", art: winterItem8 }] },
  "Адский": { preview: infernalPreview, items: [{ name: "Лавочка", art: infernalItem0 }, { name: "Угловая лавочка", art: infernalItem1 }, { name: "Фонарь", art: infernalItem2 }, { name: "Дерево", art: infernalItem3 }, { name: "Клумба", art: infernalItem4 }, { name: "Фонтан", art: infernalItem5 }, { name: "Дорожки", art: infernalItem6 }, { name: "Земля", art: infernalItem7 }, { name: "Ограда", art: infernalItem8 }] },
  "Гречневый": { preview: buckwheatPreview, items: [{ name: "Лавочка", art: buckwheatItem0 }, { name: "Угловая лавочка", art: buckwheatItem1 }, { name: "Фонарь", art: buckwheatItem2 }, { name: "Дерево", art: buckwheatItem3 }, { name: "Клумба", art: buckwheatItem4 }, { name: "Фонтан", art: buckwheatItem5 }, { name: "Дорожки", art: buckwheatItem6 }, { name: "Земля", art: buckwheatItem7 }, { name: "Ограда", art: buckwheatItem8 }] },
  "Небесный": { preview: celestialPreview, items: [{ name: "Лавочка", art: celestialItem0 }, { name: "Угловая лавочка", art: celestialItem1 }, { name: "Фонарь", art: celestialItem2 }, { name: "Дерево", art: celestialItem3 }, { name: "Клумба", art: celestialItem4 }, { name: "Фонтан", art: celestialItem5 }, { name: "Дорожки", art: celestialItem6 }, { name: "Земля", art: celestialItem7 }, { name: "Ограда", art: celestialItem8 }] },
};
