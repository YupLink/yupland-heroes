// Справочник: боссы, бой, награды, опасности, воины-охрана.
// Числа сверены с кодом 12.10.2026: encounter-* (attack, sim, damage, payout,
// share), abilities, chipStats, objectRing, flee-rules, mine-guard*.
import {
  Activity,
  Crown,
  Footprints,
  Heart,
  Medal,
  Shield,
  Skull,
  Sword,
  Swords,
  Trophy,
} from "lucide-react";
import { immunityMeta } from "@/components/itemStat";
import type { GuideEntry, GuideSection } from "../guideTypes";

const danger = (
  id: string,
  ruLabel: string,
  name: readonly [string, string],
  what: readonly [string, string],
): GuideEntry => ({
  id: `ab-${id}`,
  icon: immunityMeta(ruLabel),
  name,
  what,
});

export const BOSS_SECTION: GuideSection = {
  id: "boss",
  title: ["Боссы и бой", "Bosses and fights"],
  entries: [
    {
      id: "boss",
      icon: { Icon: Skull, color: "#ff6b6b" },
      name: ["Босс", "Boss"],
      what: [
        "Сильный противник на карте. Бьют отрядом фишек вплотную. Награда делится между всеми, кто бил, по урону.",
        "A strong enemy on the map. You fight it with your chip squad from an adjacent hex. The reward is split among everyone who hit it, by damage.",
      ],
    },
    {
      id: "boss-level",
      icon: { Icon: Crown, color: "#a78bfa" },
      name: ["Уровень и ободок", "Level and ring"],
      what: [
        "Уровень 1–100 виден по цвету ободка: серый 1–10, зелёный 11–25, синий 26–50, фиолетовый 51–80, золотой 81–100.",
        "Level 1–100 shows as the ring colour: grey 1–10, green 11–25, blue 26–50, purple 51–80, gold 81–100.",
      ],
    },
    {
      id: "boss-hp",
      icon: { Icon: Heart, color: "#6fcf6f" },
      name: ["Здоровье босса", "Boss health"],
      what: [
        "Общее для всех игроков и само не восстанавливается: каждый удар приближает победу.",
        "Shared by all players and never regenerates: every hit brings the kill closer.",
      ],
    },
    {
      id: "boss-damage",
      icon: { Icon: Sword, color: "#ff6b6b" },
      name: ["Урон за удар", "Damage per hit"],
      what: [
        "Сколько босс бьёт за раунд: число («250») или разброс («10-1000»). Не задан — растёт по раундам: 80 → 128 → 205 → 328 → 524.",
        "How hard the boss hits per round: a number (“250”) or a range (“10-1000”). If not set, it grows by round: 80 → 128 → 205 → 328 → 524.",
      ],
    },
    {
      id: "boss-cost",
      icon: { src: "/resources/energy.webp" },
      name: ["Цена боя", "Fight cost"],
      what: [
        "10 энергии и 10 сытости. Бой не состоялся — всё вернётся.",
        "10 energy and 10 satiety. Refunded if the fight didn't happen.",
      ],
    },
    {
      id: "fight",
      icon: { Icon: Swords, color: "#fb7185" },
      name: ["Как идёт бой", "How a fight goes"],
      what: [
        "Одно нажатие — весь бой. В раунде бьют все фишки строя, потом босс бьёт первую фишку (или весь строй). Павшую сменяет резерв. Бой — пока не кончится здоровье босса или отряд.",
        "One tap — the whole fight. Each round all front chips hit, then the boss hits the first chip (or the whole line). A fallen chip is replaced from reserve. Goes on until the boss or the squad runs out of health.",
      ],
      where: [
        "Отряд: 5 фишек в строю и резерв, до 10. Оглушённые и отдыхающие не идут. Павшие фишки ничего не теряют.",
        "Squad: 5 chips in front plus reserve, up to 10. Stunned and resting chips sit out. Fallen chips lose nothing.",
      ],
    },
    {
      id: "chips",
      icon: { Icon: Activity, color: "#41d3c6" },
      name: ["Фишка в бою", "Chip in a fight"],
      what: [
        "Сила фишки — её звёзды. Есть и половинки (1,5★…4,5★). Тренировочные фишки — вполсилы.",
        "A chip's power is its stars. Half stars exist too (1.5★…4.5★). Training chips fight at half power.",
      ],
      table: {
        cols: [
          ["Звёзды", "Stars"],
          ["Здоровье", "Health"],
          ["Урон за удар", "Damage per hit"],
        ],
        rows: [
          ["1★", "60", "1–12"],
          ["2★", "160", "15–26"],
          ["3★", "320", "36–47"],
          ["4★", "640", "63–74"],
          ["5★", "1150", "102–113"],
        ],
      },
    },
    {
      id: "places",
      icon: { Icon: Medal, color: "#f5c451" },
      name: ["Награда по местам", "Rewards by place"],
      what: [
        "Места — по урону за эту жизнь босса: 25, 18, 13, 10, 8, 6, 5, 5, 5, 5% фонда. Бивших меньше 10 — доли пустых мест делятся поровну. Штучные призы — первым местам.",
        "Places go by damage in this boss life: 25, 18, 13, 10, 8, 6, 5, 5, 5, 5% of the fund. Fewer than 10 hitters — empty places' shares are split evenly. Item prizes go to the top places.",
      ],
      where: [
        "Приходит в «Добычу». Товар — сразу в рюкзак, не влез — мешочком у босса.",
        "Arrives in “Harvest”. Goods go straight to the backpack; if they don't fit — a loot bag by the boss.",
      ],
    },
    {
      id: "kill",
      icon: { Icon: Trophy, color: "#f5c451" },
      name: ["Добивание и возрождение", "Kill and respawn"],
      what: [
        "«Убил» — тот, кто снял последнее здоровье. Через 5 секунд босс исчезает. Сами боссы не возрождаются — новых ставит администрация.",
        "The kill goes to whoever removes the last health. The boss disappears in 5 seconds. Bosses don't respawn by themselves — new ones are placed by the team.",
      ],
      where: [
        "Урон и убийства боссов идут в турнир.",
        "Boss damage and kills count for tournaments.",
      ],
    },
    {
      id: "runner",
      icon: { Icon: Footprints, color: "#ff5470" },
      name: ["Беглец", "Runner"],
      what: [
        "Убегает на 1–2 клетки, когда рядом шагает игрок. Может спрятаться под другим объектом — тогда сначала разберись с тем, кто сверху. Загнан в угол — принимает бой.",
        "Runs 1–2 hexes away when a player steps nearby. Can hide under another object — deal with the one on top first. Cornered — it fights.",
      ],
    },
    {
      id: "warriors",
      icon: { Icon: Shield, color: "#5b9bff" },
      name: ["Воины (охрана)", "Warriors (guards)"],
      what: [
        "Боссы из казармы. Охраняют твою шахту или магический сундук: пока охранник жив, шахту не захватить. За игрока в бою не дерутся.",
        "Bosses bought in barracks. They guard your mine or magic chest: while the guard lives, the mine can't be captured. They don't fight for you.",
      ],
      where: [
        "Бой с охранником наград не даёт; погиб — исчез. Своего бить нельзя.",
        "Fighting a guard gives no rewards; once killed it's gone. You can't attack your own.",
      ],
    },
    {
      id: "dangers",
      icon: immunityMeta("Удар по всем"),
      name: ["Опасности", "Dangers"],
      what: [
        "Способности босса. Каждая срабатывает с шансом в каждом раунде; шанс и силу видно в окне боя до атаки. Иммунитет отменяет опасность.",
        "The boss's abilities. Each may trigger every round by chance; chance and strength are shown in the fight window before attacking. Immunity cancels a danger.",
      ],
    },
    danger(
      "poison",
      "Яд",
      ["Яд", "Poison"],
      [
        "Фишка выходит в следующие бои с меньшим здоровьем (до −90%), пока не пройдут минуты.",
        "The chip enters the next fights with less health (up to −90%) until the minutes pass.",
      ],
    ),
    danger(
      "stun",
      "Оглушение",
      ["Оглушение", "Stun"],
      [
        "Фишка сразу выходит из боя и отдыхает N минут.",
        "The chip leaves the fight at once and rests for N minutes.",
      ],
    ),
    danger(
      "cleave",
      "Удар по всем",
      ["Удар по всем", "Cleave"],
      [
        "В этом раунде босс бьёт весь строй (до 5 фишек) частью удара. Иммунитета нет.",
        "This round the boss hits the whole front line (up to 5 chips) for part of its hit. No immunity.",
      ],
    ),
    danger(
      "slow",
      "Замедление",
      ["Замедление", "Slow"],
      [
        "Каждый шаг по карте дороже на N энергии. Из нескольких действует самое сильное.",
        "Every map step costs N more energy. Of several, only the strongest applies.",
      ],
    ),
    danger(
      "burn",
      "Выжигание энергии",
      ["Выжигание энергии", "Energy burn"],
      [
        "Снимает энергию со счёта — не больше 30 за бой.",
        "Takes energy from your balance — at most 30 per fight.",
      ],
    ),
    danger(
      "weak",
      "Ослабление: атака",
      ["Ослабление", "Weaken"],
      [
        "−N к атаке, броне, удаче или интеллекту героя на минуты. Действует уже в этом бою.",
        "−N to the hero's attack, armor, luck or intellect for minutes. Works already in this fight.",
      ],
    ),
  ],
};
