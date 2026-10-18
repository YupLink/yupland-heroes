// Подпись personal_sign: восстанавливаем адрес и сверяем — чужая подпись не проходит.
import { describe, expect, it } from "vitest";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { addressOf, normAddress, personalHash, recoverAddress } from "./sig";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function signPersonal(message: string, priv: Uint8Array): string {
  const rec = secp256k1.sign(personalHash(message), priv, { prehash: false, format: "recovered" });
  // recovered = [recid, r(32), s(32)] → Ethereum: r‖s‖v (v = 27 + recid)
  return `0x${hex(rec.slice(1))}${(27 + rec[0]).toString(16)}`;
}

describe("eth sig", () => {
  const priv = secp256k1.utils.randomSecretKey();
  const address = addressOf(secp256k1.getPublicKey(priv, false));

  it("своя подпись — тот же адрес", () => {
    const msg = "YupLink: привязать Ethereum-кошелёк к аккаунту.\nКод: abc";
    expect(recoverAddress(msg, signPersonal(msg, priv))).toBe(address);
  });

  it("другое сообщение — другой адрес; мусор — null", () => {
    const sig = signPersonal("код 1", priv);
    expect(recoverAddress("код 2", sig)).not.toBe(address);
    expect(recoverAddress("код 1", "0x1234")).toBeNull();
  });

  it("известный вектор: ключ 0x…01 — адрес 0x7e5f…5bdf", () => {
    const one = new Uint8Array(32);
    one[31] = 1;
    expect(addressOf(secp256k1.getPublicKey(one, false))).toBe("0x7e5f4552091a69125d5dfcb7b8c2659029395bdf");
  });

  it("адрес приводится к нижнему регистру, мусор отсекается", () => {
    expect(normAddress(" 0x5A2A792EDE6EB1F0ECCD5F6B7EE5A8AAAE64E08C ")).toBe(
      "0x5a2a792ede6eb1f0eccd5f6b7ee5a8aaae64e08c",
    );
    expect(normAddress("0x123")).toBeNull();
  });
});
