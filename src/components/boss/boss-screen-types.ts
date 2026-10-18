// Виды наполнителя и подпись к ним — ОДИН источник с редактором наград
// (admin/reward/rewardDraft). Своя копия отставала: редактор уже умеет ресурс и
// свой товар, а здесь их не было — и экран босса не принимал такой черновик.
//
// Конверторы черновика — ТОЖЕ канонические, своих здесь больше нет. Местная
// копия fromDraftCfg не фильтровала ни пустой пак (схема boss.ts требует
// packId min(1) — сохранение падало), ни токен без символа монеты (уезжал в
// раздачу pending без ft_contract).
export type {
  FillerKind,
  Filler,
  DraftFiller,
  DraftConfig,
  RewardConfig,
  PackReward,
  ItemReward,
} from "@/components/admin/reward/rewardDraft";
export {
  fillerMeta,
  clampNum,
  DEFAULT_SPLIT,
  DEF_CFG,
  toDraftCfg,
  fromDraftCfg,
} from "@/components/admin/reward/rewardDraft";

export function fmtCountdown(toIso: string): string {
  const ms = new Date(toIso).getTime() - Date.now();
  if (ms <= 0) return "вот-вот";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (totalMin >= 1440) return `${d}д ${h}ч`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type InvChip = { templateId: string; templateNo?: number; templateName: string; imageUrl: string; level: number; count: number; restingCount?: number; tirage?: number | null; isPremium?: boolean; chips?: Array<{ id: string; serialNo: number | null; restUntil?: string | null }> };
export type LineChip = { templateId: string; serialNo?: number | null; level: number; image: string; name: string };

export const FIELD_SLOTS = 5;
export const MAX_LINEUP = 10;

export type SessionFieldChip = { templateId: string; level: number; hp: number; maxHp: number; alive: boolean; serialNo?: number | null };
export type SessionReserveChip = { templateId: string; level: number; hp: number; maxHp: number; serialNo?: number | null };
export type BossSessionState = {
  bossHp: number; bossMaxHp: number;
  field: SessionFieldChip[]; reserve: SessionReserveChip[];
  round: number; totalDamage: number;
};
export type PlayerHit = { index: number; level: number; dmg: number };
export type BossTarget = { index: number; level: number; dmg: number; died: boolean };
export type RoundInfo = {
  playerDmg: number; bossDmg: number;
  targetLevel: number | null; targetDied: boolean; broughtInLevel: number | null;
  playerHits: PlayerHit[]; bossTarget: BossTarget | null;
};
export type FightResult = { killed: boolean; totalDamage: number; likeAwarded: number; bossHpAfter: number };
export type BattleSession = {
  sessionId: string;
  state: BossSessionState;
  bossName: string;
  bossImageUrl: string | null;
  log: Array<{ round: number } & RoundInfo>;
  ended: boolean;
  result: FightResult | null;
};

export async function uploadFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Только изображения");
  const srcUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Не удалось прочитать файл"));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Битое изображение"));
    im.src = srcUrl;
  });
  const MAX = 512;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height) || 1);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.drawImage(img, 0, 0, w, h);
  let out = canvas.toDataURL("image/webp", 0.82);
  if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", 0.85);
  if (out.length > 400_000) out = canvas.toDataURL("image/jpeg", 0.7);
  return out;
}
