// Предел рабочих процессов игры: большее из compose портала и scripts/cluster.json
// (YupLink), но не выше потолка — ядра сервера делят все проекты.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ClusterConfig = {
  HARD_CAP: number;
  readClusterFile: (file: string) => { maxWorkers?: unknown };
  resolveMaxWorkers: (o: { min: number; envMax: number; fileMax: unknown }) => number;
};
const modPath = path.resolve(__dirname, "../../../scripts/cluster-config.mjs");
const cfg = (await import(/* @vite-ignore */ modPath)) as ClusterConfig;

describe("предел рабочих", () => {
  it("в репо YupLink — 4 в пике (слово владельца 13.10)", () => {
    const file = cfg.readClusterFile(path.resolve(__dirname, "../../../scripts/cluster.json"));
    expect(file.maxWorkers).toBe(4);
    // В compose портала сейчас 2 — побеждает наше 4.
    expect(cfg.resolveMaxWorkers({ min: 1, envMax: 2, fileMax: file.maxWorkers })).toBe(4);
  });

  it("compose может поднять планку, но не опустить", () => {
    expect(cfg.resolveMaxWorkers({ min: 1, envMax: 5, fileMax: 4 })).toBe(5);
    expect(cfg.resolveMaxWorkers({ min: 1, envMax: 1, fileMax: 4 })).toBe(4);
  });

  it("битая или пустая настройка — как раньше, по compose", () => {
    expect(cfg.resolveMaxWorkers({ min: 1, envMax: 2, fileMax: undefined })).toBe(2);
    expect(cfg.resolveMaxWorkers({ min: 1, envMax: 2, fileMax: "4" })).toBe(2);
    const bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cl-")), "cluster.json");
    fs.writeFileSync(bad, "{ не json");
    expect(cfg.readClusterFile(bad)).toEqual({});
    expect(cfg.readClusterFile(bad + ".нет")).toEqual({});
  });

  it("потолок — даже по ошибке не больше HARD_CAP", () => {
    expect(cfg.resolveMaxWorkers({ min: 1, envMax: 2, fileMax: 50 })).toBe(cfg.HARD_CAP);
  });
});
