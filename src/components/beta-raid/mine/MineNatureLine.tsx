// Окружение лесопилки и каменоломни (владелец, 25.10.2026, §8.80): сколько
// деревьев (гор) на шести соседних клетках и во сколько это обходится добыче —
// n/3: 0 — стоит, 3 — 100 %, 6 — 200 %. С 09.11 n — доли (дерево у двух шахт —
// по половинке), подпись до десятых. Нет числа (старая сборка, остров,
// золото, алмазы) — строки нет.
import { useLang, useT } from "@/lib/i18n";
import { mineNatureMult, natureNText, type MineV2Resource } from "@/lib/mineV2";

export function MineNatureLine({
  kind,
  n,
}: {
  kind: MineV2Resource;
  n: number | null | undefined;
}) {
  const t = useT();
  const lang = useLang();
  if (n == null || (kind !== "wood" && kind !== "stone")) return null;
  const p = Math.round(mineNatureMult(kind, false, n) * 100);
  return (
    <p
      className={`text-center text-[11px] tabular-nums ${p < 100 ? "text-destructive" : "text-muted-foreground"}`}
    >
      {t(kind === "wood" ? "mine2.nature_trees" : "mine2.nature_mountains", {
        n: natureNText(n, lang),
        p,
      })}
    </p>
  );
}
