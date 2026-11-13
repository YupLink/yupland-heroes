// Пароль кошелька шифрует ключи (11.11.2026): без пароля кошелёк не создать, не
// подписать и не показать сид; прежние записи запечатываются при вводе пароля;
// смена пароля перешифровывает одной транзакцией и переживает обрыв; копия в
// localStorage возвращает пропавшую запись; ключ другой вкладки — устаревший.
import { beforeAll, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => new Map<string, unknown>());
vi.mock("./secureWalletDb", () => ({
  idbPut: async (k: string, v: unknown) => void db.set(k, v),
  idbPutMany: async (es: Array<[string, unknown]>) => es.forEach(([k, v]) => db.set(k, v)),
  idbGet: async (k: string) => db.get(k) ?? null,
  idbDelete: async (k: string) => void db.delete(k),
  idbKeys: async () => [...db.keys()],
}));

// localStorage для appLock/walletStorage (окружение тестов — node).
const store = new Map<string, string>();
const ls = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
Object.assign(globalThis, { window: { localStorage: ls }, localStorage: ls });

const SEED =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const LS_PWD = "yl:applock-v1";

let sw: typeof import("./secureWallet");
let lock: typeof import("./appLock");
let crypt: typeof import("./appLockCrypto");
let ed: typeof import("@noble/ed25519");

beforeAll(async () => {
  sw = await import("./secureWallet");
  lock = await import("./appLock");
  crypt = await import("./appLockCrypto");
  ed = await import("@noble/ed25519");
});

const msg = new Uint8Array([1, 2, 3, 4]);
const pubOf = (s: string) => import("@scure/base").then((b) => b.base58.decode(s.slice(8)));
type Rec = Record<string, unknown>;

/** Запись «как до 11.11»: сид под ключом браузера. */
async function putLegacy(id: string, seed = SEED, broken = false) {
  const { deriveRawKeyFromSeedPhrase } = await import("./embeddedWallet");
  const { publicKeyStr } = await deriveRawKeyFromSeedPhrase(seed);
  const seedWrapKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const seedIv = crypto.getRandomValues(new Uint8Array(12));
  const seedCt = broken
    ? new ArrayBuffer(8)
    : await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: seedIv },
        seedWrapKey,
        new TextEncoder().encode(seed),
      );
  db.set(id, {
    mode: "aes",
    accountId: id,
    publicKeyStr,
    signingKey: null,
    seedWrapKey,
    seedIv,
    seedCt,
  });
}

describe("пароль кошелька шифрует ключи", () => {
  it("без пароля: кошелёк не создаётся, прежний — не подписывает", async () => {
    await expect(sw.setupSecureWallet(SEED, "new.near")).rejects.toThrow("APP_PWD_SETUP");
    expect(db.has("new.near")).toBe(false);
    await putLegacy("w1.near");
    await expect(sw.signWithSecure("w1.near", msg)).rejects.toThrow("APP_PWD_SETUP");
    await expect(sw.revealSeed("w1.near")).rejects.toThrow("APP_PWD_SETUP");
  });

  it("пароль поставлен — прежняя запись запечатана, с блобом пароля; подпись верная", async () => {
    await putLegacy("bad.near", SEED, true); // нечитаемая — не мешает
    await lock.setupAppPassword("password-1");
    const rec = db.get("w1.near") as Rec;
    expect(rec.sealedCt).toBeTruthy();
    expect(rec.seedWrapKey).toBeUndefined();
    expect(rec.signingKey).toBeNull();
    expect((rec.vault as { salt: string }).salt).toBe(JSON.parse(store.get(LS_PWD)!).salt);
    expect((db.get("bad.near") as Rec).sealedCt).toBeUndefined();
    db.delete("bad.near");
    expect(await sw.revealSeed("w1.near")).toBe(SEED);
    const sig = await sw.signWithSecure("w1.near", msg);
    expect(await ed.verifyAsync(sig, msg, await pubOf(rec.publicKeyStr as string))).toBe(true);
  });

  it("замок или перезагрузка — нельзя; верный пароль — снова можно", async () => {
    lock.lockApp();
    await expect(sw.revealSeed("w1.near")).rejects.toThrow("APP_LOCKED");
    await expect(sw.setupSecureWallet(SEED, "new.near")).rejects.toThrow("APP_LOCKED");
    await expect(lock.unlockApp("wrong-pass")).rejects.toThrow("Неверный пароль");
    await lock.unlockApp("password-1");
    expect(await sw.revealSeed("w1.near")).toBe(SEED);
  });

  it("смена пароля перешифровывает; старый пароль больше не открывает", async () => {
    await lock.changeAppPassword("password-1", "password-2");
    lock.lockApp();
    await expect(lock.unlockApp("password-1")).rejects.toThrow("Неверный пароль");
    await lock.unlockApp("password-2");
    expect(await sw.revealSeed("w1.near")).toBe(SEED);
  });

  it("смена оборвалась после записи кошельков — вход новым паролем, кошельки целы", async () => {
    const oldKey = await crypt.verifyOnly(JSON.parse(store.get(LS_PWD)!), "password-2");
    const next = await crypt.makeBlob("password-3");
    await sw.resealAllWallets(oldKey, next.key, next.blob); // пароль в localStorage — прежний
    lock.lockApp();
    await expect(lock.unlockApp("password-2")).rejects.toThrow("Неверный пароль");
    await lock.unlockApp("password-3");
    expect(JSON.parse(store.get(LS_PWD)!).salt).toBe(next.blob.salt);
    expect(await sw.revealSeed("w1.near")).toBe(SEED);
  });

  it("новый кошелёк при открытом пароле — сразу запечатан", async () => {
    const { base58 } = await import("@scure/base");
    await sw.setupSecureWalletFromPrivateKey(
      `ed25519:${base58.encode(new Uint8Array(32).fill(7))}`,
      "k1.near",
    );
    const rec = db.get("k1.near") as Rec;
    expect(rec.sealedCt).toBeTruthy();
    expect(rec.privWrapKey).toBeUndefined();
    expect(await sw.revealPrivateKey("k1.near")).toMatch(/^ed25519:/);
  });

  it("открытый сид в localStorage → запечатанная копия; пропала запись — вернулась из копии", async () => {
    const { makePlainBlob } = await import("./walletStorage");
    store.set("yl:wallet:old.near", makePlainBlob(SEED));
    lock.lockApp();
    await lock.unlockApp("password-3");
    expect(store.has("yl:wallet:old.near")).toBe(false);
    expect(store.get("yl:wallet-vault:old.near")).not.toContain("abandon");
    db.delete("old.near"); // IndexedDB не пережил перезаход
    expect(await sw.listSecureAccounts()).toContain("old.near");
    expect(await sw.revealSeed("old.near")).toBe(SEED);
  });

  it("localStorage без пароля, кошельки остались — новый пароль не заводится", async () => {
    store.delete(LS_PWD);
    lock.lockApp();
    await expect(lock.setupAppPassword("another-pass")).rejects.toThrow("Пароль уже установлен");
    expect(lock.hasAppPassword()).toBe(true);
    await lock.unlockApp("password-3");
    expect(await sw.revealSeed("w1.near")).toBe(SEED);
  });

  it("другая вкладка сменила пароль — ключ этой вкладки устарел, запись не пишется", async () => {
    const other = await crypt.makeBlob("password-x");
    const saved = store.get(LS_PWD)!;
    store.set(LS_PWD, JSON.stringify(other.blob));
    await expect(sw.setupSecureWallet(SEED, "stale.near")).rejects.toThrow("APP_LOCKED");
    expect(db.has("stale.near")).toBe(false);
    store.set(LS_PWD, saved);
  });

  it("снять пароль, пока на устройстве есть кошелёк, нельзя", async () => {
    await expect(lock.removeAppPassword("password-3")).rejects.toThrow("Пароль нужен");
  });

  it("«забыл пароль»: под паролем — удаляются; не перенесённые при открытом замке — остаются", async () => {
    expect(await lock.forgotAppPassword()).toBe("removed");
    expect(db.size).toBe(0);
    expect(lock.hasAppPassword()).toBe(false);
    // Как до 11.11: прежняя запись, пароль и открытая метка сессии.
    await putLegacy("w2.near");
    store.set(LS_PWD, JSON.stringify((await crypt.makeBlob("old-password")).blob));
    store.set("yl:applock-session", "never");
    expect(await lock.forgotAppPassword()).toBe("kept");
    expect(db.has("w2.near")).toBe(true);
    expect(lock.hasAppPassword()).toBe(false);
  });
});
