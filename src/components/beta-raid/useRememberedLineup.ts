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

export function useRememberedLineup() {
  const [lineup, setLineup] = useState<LineChip[]>([]);
  const restored = useRef(false);

  // Читаем после монтирования: на сервере localStorage нет, иначе гидрация ляжет.
  useEffect(() => {
    setLineup(load());
    restored.current = true;
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
