// Улучшение игрока за алмаз (Ярослав 30.10.2026; владелец 31.10–01.11.2026: «1 раз всего — для
// каждого свой», «кто купил — тому и +50 % и +1 ячейка, тому кто не купил — нет ни того, ни
// другого»). Оно ОДНО на аккаунт: кнопка в окне фермы и кнопка в окне склада продают одно и то же.
// Купил в любом окне — на всех фермах доля героев игрока ×1,5 и +1 личная ячейка на складах.
// Вид в базе (farm/warehouse) — только где купил. База — migrations/farm-01, farm-02.
import { OWN_CELLS } from "./warehouseCells";

export const UPGRADE_KINDS = ["farm", "warehouse"] as const;
export type UpgradeKind = (typeof UPGRADE_KINDS)[number];
export type Upgrades = Record<UpgradeKind, boolean>;

/** Цена улучшения, алмазов. */
export const UPGRADE_DIAMONDS = 1;
/** Ферма после улучшения: доля игрока ×1,5 (+50 % к базе). */
export const FARM_UPGRADE_MULT = 1.5;

export const NO_UPGRADES: Upgrades = { farm: false, warehouse: false };

/** Куплено ли улучшение (в любом окне). */
export const isUpgraded = (u: Upgrades): boolean => u.farm || u.warehouse;

/** Личных ячеек склада у игрока: 2, с улучшением — 3. */
export const ownCellsWith = (u: Upgrades): number => OWN_CELLS + (isUpgraded(u) ? 1 : 0);

/** Множитель ферм игрока. */
export const farmMultWith = (u: Upgrades): number => (isUpgraded(u) ? FARM_UPGRADE_MULT : 1);

export const isUpgradeKind = (v: unknown): v is UpgradeKind =>
  typeof v === "string" && (UPGRADE_KINDS as readonly string[]).includes(v);
