// Панель острова закрывается, когда обучение позади (владелец, 13.11.2026: «невозможно
// закрыть окно — только свернуть его»). Закрытая — значок у края экрана (ачивки нужны
// для выхода с острова, совсем их не прячем). Помним по острову.
import { useEffect, useState } from "react";

const keyOf = (mapId: string | null) => `beta-raid:island-closed:${mapId ?? ""}`;

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function write(key: string, on: boolean): void {
  try {
    window.localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* только на этот заход */
  }
}

export function useIslandPanelClosed(mapId: string | null, closable: boolean): [boolean, (on: boolean) => void] {
  const [closed, setClosedState] = useState(() => closable && read(keyOf(mapId)));
  // Снова идёт обучение (вернулся к нему) — панель видна.
  useEffect(() => {
    if (!closable) setClosedState(false);
  }, [closable]);
  const setClosed = (on: boolean) => {
    setClosedState(on);
    write(keyOf(mapId), on);
  };
  return [closable && closed, setClosed];
}
