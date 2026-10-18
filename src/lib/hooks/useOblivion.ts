// Эффект «Забвение» на игроке — один кэш на приложение, как энергия.
//
// Читают двое: значок над героем (BetaEffectHud) и кнопка «Забыть» в книге
// героя (SpellbookGrid) — и оба обязаны видеть одно и то же. Выдачу и трату
// гасят через ключ "my-oblivion": он в HERO_QUERY_KEYS (lib/query.ts), так что
// зелье, каст и алтарь обновляют его без F5.
//
// Сроки кончаются сами: и безлимит, и заряды со сроком. Хук перерисовывается к
// ближайшему из них, и «Забыть» пропадает, не дожидаясь запроса. Сроки — по
// часам СЕРВЕРА (oblivionClock): у телефона с отстающими часами эффект
// снимается тогда же, когда его снял сервер, а не на минуты позже.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMyOblivion } from "@/api";
import { oblivionActive, type OblivionState } from "@/lib/hero/boostOblivion";
import { oblivionOnDevice, stampOblivion } from "@/lib/hero/oblivionClock";

export const OBLIVION_KEY = ["my-oblivion"] as const;

/** Самый долгий таймер, который умеет setTimeout (~24,8 суток). */
const MAX_TIMEOUT = 2 ** 31 - 1;

export function useOblivion(): OblivionState & { active: boolean } {
  const q = useQuery({
    queryKey: OBLIVION_KEY,
    // Метку получения ставим сразу: сдвиг часов меряется в момент ответа.
    queryFn: async () => {
      const sentAt = Date.now();
      const reply = await getMyOblivion();
      return stampOblivion(reply, sentAt, Date.now());
    },
    staleTime: 30_000,
  });
  // Кэш мог сохранить ответ другой сборки — форму не берём на веру. Сроки — уже
  // в часах телефона.
  const state = oblivionOnDevice(q.data);
  // Счётчик тиков — в зависимостях: после первого срока ставим таймер ко второму.
  const [ticks, tick] = useState(0);
  useEffect(() => {
    const left = [state.until, state.timedUntil]
      .map((at) => (at ? Date.parse(at) - Date.now() : NaN))
      .filter((ms) => ms > 0);
    if (left.length === 0) return;
    const id = setTimeout(() => tick((n) => n + 1), Math.min(Math.min(...left) + 250, MAX_TIMEOUT));
    return () => clearTimeout(id);
  }, [state.until, state.timedUntil, ticks]);
  return { ...state, active: oblivionActive(state) };
}
