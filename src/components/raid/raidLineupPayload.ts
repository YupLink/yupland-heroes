// Отряд для старого рейда (raidAutoFight) из состава пикера.
//
// Тренировочную фишку сервер (raid-combat.ts) ищет по её id в поле chipId, а
// не в инвентаре; раньше клиент отправлял только шаблон и уровень, и такая
// фишка молча превращалась в «фишку, которой у тебя нет».
import type { LineChip } from "@/components/game/ChipSquadPicker";

export type RaidLineupEntry = {
  templateId: string;
  level: number;
  serialNo: number | null;
  training?: boolean;
  chipId?: string;
};

export function toRaidLineup(lineup: LineChip[]): RaidLineupEntry[] {
  return lineup.map((c) => ({
    templateId: c.templateId,
    level: c.level,
    serialNo: c.serialNo ?? null,
    ...(c.training ? { training: true, chipId: c.trainingId } : {}),
  }));
}
