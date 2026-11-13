// Отряд запоминается между боями: собрал один раз — следующая цель уже
// открывается с тем же составом. Раньше каждый бой начинался с пустого поля.
//
// Храним локально (localStorage) и только «адрес» фишки — картинку и имя
// подставляем из свежего состава, чтобы не показывать сгоревшую фишку.
import { useEffect, useRef, useState } from "react";
import type { LineChip } from "@/components/game/ChipSquadPicker";

// Ключ общий на браузер: привязать к аккаунту нечем (кошелёк лежит в
// httpOnly-cookie). Чужой состав не опасен — ChipSquadPicker подрезает его
// по актуальному инвентарю, а бой всё равно проверяется на сервере.
const KEY = "beta-raid:lineup";

function load(): LineChip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (c): c is LineChip =>
        !!c &&
        typeof (c as LineChip).templateId === "string" &&
        typeof (c as LineChip).level === "number",
    );
  } catch {
    return [];
  }
}

/** Отряд прямо сейчас — для удара тапом по цели, без окна (fight/useRaidFight). */
export const readRememberedLineup = load;

const EVENT = "beta-raid:lineup";

/**
 * Запомнить состав, который сервер собрал сам (фишки не были выбраны — самые сильные,
 * encounter-lineup): в окне боя «фишки» сразу показывают, кем бились. Картинку и имя
 * подставит свежий состав (ChipSquadPicker), здесь — только адрес фишки.
 */
export function rememberLineup(chips: ReadonlyArray<{ templateId: string; level: number; training?: boolean; trainingId?: string }>): void {
  if (typeof window === "undefined" || chips.length === 0) return;
  const lineup: LineChip[] = chips.map((c) => ({
    templateId: c.templateId,
    level: Number(c.level),
    image: "",
    name: "",
    ...(c.training && c.trainingId ? { training: true, trainingId: c.trainingId } : {}),
  }));
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lineup));
  } catch {
    /* переполнено — просто не запомним состав */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useRememberedLineup() {
  const [lineup, setLineup] = useState<LineChip[]>([]);
  const restored = useRef(false);

  // Читаем после монтирования: на сервере localStorage нет, иначе гидрация ляжет.
  useEffect(() => {
    setLineup(load());
    restored.current = true;
    // Сервер собрал состав сам (rememberLineup) — открытое окно показывает его сразу.
    const reload = () => setLineup(load());
    window.addEventListener(EVENT, reload);
    return () => window.removeEventListener(EVENT, reload);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // До первого чтения не пишем: иначе пустой стартовый состав затёр бы
    // сохранённый в том же коммите.
    if (!restored.current) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(lineup));
    } catch {
      /* переполнено — просто не запомним состав */
    }
  }, [lineup]);

  return [lineup, setLineup] as const;
}
