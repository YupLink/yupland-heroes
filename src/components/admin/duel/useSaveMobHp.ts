// Бой окончен — жизни ваших мобов в базу (владелец 09.11.2026: «мобы живые сохраняются;
// регистрировать их жизни — чтобы в следующем бою их жизни соответствовали»): живой и
// раненый — его жизни, павший или полный — снова полный (в песочнице моб казармы не
// исчезает). Один раз на бой; расклад перечитывается — следующий бой с новыми жизнями.
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DuelState } from "@/lib/duel/types";
import { saveDuelMobs } from "@/server/api/duel/duel-api";

export function useSaveMobHp(st: DuelState): void {
  const qc = useQueryClient();
  const done = useRef(false);
  const over = !!st.winner || !!st.draw;
  useEffect(() => {
    if (!over || done.current) return;
    done.current = true;
    const mobs = st.units
      .filter((u) => u.side === "a" && u.kind === "mob")
      .map((u) => {
        const [, template, copy] = u.id.split(":");
        return { template, copy: Number(copy) || 0, hp: Math.max(0, u.hp) };
      });
    if (mobs.length === 0) return;
    void saveDuelMobs({ data: { mobs } })
      .then(() => qc.invalidateQueries({ queryKey: ["duel-setup"] }))
      .catch(() => {});
  }, [over, st, qc]);
}
