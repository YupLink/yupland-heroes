// Шаблон точки спавна (владелец, 06.11.2026): радиус и строки мобов точки
// (lib/raid/spawnPoint) без клетки — ставится тапами по карте в режиме бога.
import type { SpawnPointMob } from "./spawnPoint";

export type SpawnTemplate = { id: string; name: string; radius: number; mobs: SpawnPointMob[] };

/** Имя шаблона по умолчанию: мобы точки и радиус. */
export function templateName(
  radius: number,
  mobs: ReadonlyArray<Pick<SpawnPointMob, "mob" | "count">>,
  names: ReadonlyMap<string, string>,
): string {
  const list = mobs.map((m) => `${names.get(m.mob) ?? m.mob}${m.count > 1 ? ` ×${m.count}` : ""}`);
  return `${list.join(", ")} · r${radius}`.slice(0, 60);
}
