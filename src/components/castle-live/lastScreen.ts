// Последний экран игрока — замок или карта мира (владелец, 13.10.2026: «был на
// карте — после перезагрузки на карте, был в замке — в замке»). Раньше после
// перезагрузки у замка всегда открывался замок, и из него приходилось выходить.
// Память — на устройстве, по кошельку: на общем устройстве у каждого своя.
export type GameScreen = "castle" | "raid";

const key = (wallet: string) => `gd-last-screen:${wallet}`;

export function readLastScreen(wallet: string | null | undefined): GameScreen | null {
  if (!wallet) return null;
  try {
    const v = window.localStorage.getItem(key(wallet));
    return v === "castle" || v === "raid" ? v : null;
  } catch {
    return null;
  }
}

export function writeLastScreen(wallet: string | null | undefined, screen: GameScreen): void {
  if (!wallet) return;
  try {
    window.localStorage.setItem(key(wallet), screen);
  } catch {
    /* без памяти — как раньше, по месту героя */
  }
}

/**
 * Где начать. Был на карте — на карте. Был в замке — в замке, но только если
 * герой у замка или ратуши (внутрь издалека не попасть). Памяти нет — как
 * раньше: у замка — замок, иначе мир.
 */
export function startScreen(saved: GameScreen | null, atCastle: boolean): GameScreen {
  if (saved === "raid") return "raid";
  return atCastle ? "castle" : "raid";
}
