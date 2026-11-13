import { mkdtemp, mkdir, writeFile, utimes, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { archiveBuildAssets, assetType, isSafeAssetName, readArchivedAsset } from "./assetArchive";

let root = "";
const put = async (build: string, name: string, body: string) => {
  const dir = path.join(root, ".builds", build, "public", "assets");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), body);
};

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "assets-"));
  process.env.ASSET_ARCHIVE_ROOT = root;
});
afterEach(() => {
  delete process.env.ASSET_ARCHIVE_ROOT;
});

describe("архив файлов прошлых сборок", () => {
  it("складывает файлы всех сборок и отдаёт старый кусок, которого нет в новой", async () => {
    await put("old", "tavern-Cq0P74Fv.js", "old tavern");
    await put("new", "tavern-New12345.js", "new tavern");
    expect(await archiveBuildAssets()).toEqual({ copied: 2, pruned: 0 });
    expect(String(await readArchivedAsset("tavern-Cq0P74Fv.js"))).toBe("old tavern");
    // Повторный старт рабочего ничего не копирует заново, временных файлов не остаётся.
    expect(await archiveBuildAssets()).toEqual({ copied: 0, pruned: 0 });
    expect((await readdir(path.join(root, ".assets-archive"))).sort()).toEqual([
      "tavern-Cq0P74Fv.js",
      "tavern-New12345.js",
    ]);
  });

  it("недельные файлы убирает", async () => {
    await put("old", "a.js", "a");
    await archiveBuildAssets();
    const week = (Date.now() - 8 * 24 * 3600_000) / 1000;
    await utimes(path.join(root, ".assets-archive", "a.js"), week, week);
    await put("new", "b.js", "b");
    expect(await archiveBuildAssets()).toEqual({ copied: 1, pruned: 1 });
    expect(await readArchivedAsset("a.js")).toBeNull();
  });

  it("не отдаёт ничего за пределами архива и без сборок молчит", async () => {
    expect(await archiveBuildAssets()).toEqual({ copied: 0, pruned: 0 });
    for (const bad of ["../.env", "..", ".env", "a/b.js", "a\\b.js", ""]) {
      expect(isSafeAssetName(bad)).toBe(false);
      expect(await readArchivedAsset(bad)).toBeNull();
    }
  });

  it("тип файла по расширению", () => {
    expect(assetType("x-1.js")).toBe("text/javascript; charset=utf-8");
    expect(assetType("x.CSS")).toBe("text/css; charset=utf-8");
    expect(assetType("x.bin")).toBe("application/octet-stream");
  });
});
