// ZIP без сжатия: эталонная CRC, разбор собственного архива и — где есть —
// проверка системным unzip (он и скажет, откроет ли архив обычный компьютер).
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crc32, zipParts } from "./zipStore";

const bytes = (s: string) => new TextEncoder().encode(s);
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const files = [
  { name: "Здания/Ратуша.webp", data: bytes("ratusha-bytes") },
  { name: "Товары/Еда/Хлеб.png", data: bytes("bread") },
  { name: "Пустой.png", data: new Uint8Array(0) },
];

describe("crc32", () => {
  it("эталон «123456789» = CBF43926", () => {
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });
});

describe("zipParts", () => {
  const zip = concat(zipParts(files, new Date(2026, 9, 6, 12, 30, 10)));
  const view = new DataView(zip.buffer);

  it("оглавление в конце знает все файлы и указывает на них", () => {
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(files.length);
    let at = view.getUint32(end + 16, true);
    const dec = new TextDecoder();
    for (const f of files) {
      expect(view.getUint32(at, true)).toBe(0x02014b50);
      expect(view.getUint16(at + 8, true) & 0x0800).toBe(0x0800); // имена в UTF-8
      const nameLen = view.getUint16(at + 28, true);
      expect(dec.decode(zip.subarray(at + 46, at + 46 + nameLen))).toBe(f.name);
      const local = view.getUint32(at + 42, true);
      expect(view.getUint32(local, true)).toBe(0x04034b50);
      const dataAt = local + 30 + view.getUint16(local + 26, true);
      const data = zip.subarray(dataAt, dataAt + view.getUint32(at + 20, true));
      expect(crc32(data)).toBe(view.getUint32(at + 16, true));
      expect(dec.decode(data)).toBe(dec.decode(f.data));
      at += 46 + nameLen;
    }
  });

  it("архив проверяют системные инструменты: unzip — целость, Python — русские имена", () => {
    const has = (cmd: string, args: string[]) => {
      try {
        execFileSync(cmd, args, { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    };
    const dir = mkdtempSync(join(tmpdir(), "zipstore-"));
    const path = join(dir, "a.zip");
    writeFileSync(path, zip);
    if (has("unzip", ["-v"])) execFileSync("unzip", ["-tq", path]);
    // Консольный unzip на macOS собран без Unicode и флаг UTF-8 не читает;
    // эталон ZIP — zipfile из Python (им же открывают архивы и в Windows так же).
    if (!has("python3", ["--version"])) return;
    const script = "import sys,zipfile;print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))";
    const list = execFileSync("python3", ["-c", script, path]).toString("utf8");
    expect(list).toContain("Здания/Ратуша.webp");
    expect(list).toContain("Товары/Еда/Хлеб.png");
  });
});
