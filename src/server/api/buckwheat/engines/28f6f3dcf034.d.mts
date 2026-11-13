// Типы для сервера Yupland Heroes (src/server/api/buckwheat): движок — engine.mjs
// Кайлани как есть, здесь только то, чем пользуется сервер.
export type Cell = { row: number; col: number };
export type Board = number[][];
export type Animation = { steps: unknown[]; [key: string]: unknown };
export type Game = {
  board: Board;
  random: () => number;
  moves: number;
  crowns: number;
  grecha: number;
  chain: number;
  finished: boolean;
  lastGain: number;
  lastAnimation: Animation | null;
  lastEntryCol: number;
  finalePlayed?: boolean;
};
export const ROWS: number;
export const COLS: number;
export const MOVES: number;
export const ENTRY_GOLD: number;
export const CROWN_GOLD: number;
export const TARGET_CROWNS: number;
export function seededRandom(seed: number): () => number;
export function createGame(seed?: number): Game;
export function canSwap(board: Board, a: Cell, b: Cell): boolean;
export function playSwap(game: Game, a: Cell, b: Cell): boolean;
export function finishBonuses(game: Game): Animation | null;
export function payout(game: Game): { entry: number; returned: number; net: number; grecha: number };
