import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Бой на карте без окна (владелец, 22.10.2026): тап по цели бьёт сразу,
// окно цели — по «i», в итоге боя — «Атаковать снова».
export const dict: Record<string, Entry> = {
  "braid.attack_again": { ru: "Атаковать снова", en: "Attack again" },
  "braid.target_info": { ru: "О цели", en: "Target info" },
};
