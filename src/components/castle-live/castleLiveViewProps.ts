// Настройки экрана замка (CastleLiveView) — отдельно, чтобы сам экран
// оставался в пределах лимита строк.
import type { Asset, CellMap } from "@/components/castle-editor/types";
import type { QuestProgress } from "./CastleQuestBoard";
import type { PlayerLevelProgress } from "./CastleProfile";

export type CastleLiveViewProps = {
  cells: CellMap;
  assets: Asset[];
  onEdit: () => void;
  onCity?: () => void;
  /** Вышел из аккаунта: сессии редактора больше нет — уводим со страницы. */
  onSignedOut?: () => void;
  entry?: "editor" | "game";
  profileWalletStatus?: "connected" | "disconnected";
  profileWalletName?: string;
  onPreviewWalletChange?: (connected: boolean, name?: string) => void;
  treasuryWalletRequest?: number;
  questProgress?: Record<string, QuestProgress>;
  onClaimQuestReward?: (questId: string) => void | Promise<void>;
  playerLevel?: PlayerLevelProgress;
  /** Действие в ратуше доступно только у замка, который не является основным. */
  onMakeMainCastle?: () => void;
  isMainCastle?: boolean;
};
