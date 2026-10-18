export type BossEncounter = {
  id: string;
  name: string;
  imageUrl: string | null;
  interactionCost: number;
};

export type FightState = {
  bossId: string;
  bossName: string;
  bossImageUrl: string | null;
  maxHp: number;
  currentHp: number;
  rounds: Array<{ damage: number }>;
  lineup: Array<{ templateId: string; level: number }>;
  rewardConfig: unknown;
  interactionCost: number;
};

export type FightSession = {
  sessionId: string;
  state: FightState;
};
