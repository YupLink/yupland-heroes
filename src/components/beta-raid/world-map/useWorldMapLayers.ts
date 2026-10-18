// Выключенные виды меток карты мира: состояние окна и запись на устройстве.
import { useState } from "react";
import {
  loadHidden,
  saveHidden,
  toggleBuildings,
  toggleLayer,
  type WorldLayer,
} from "./worldMapLayers";

export function useWorldMapLayers(): {
  hidden: ReadonlySet<WorldLayer>;
  toggle: (layer: WorldLayer) => void;
  /** «Все постройки»: anyOn — видна ли сейчас хоть одна постройка. */
  toggleAll: (anyOn: boolean) => void;
} {
  // Окно открывается только тапом в браузере: localStorage уже есть, гидрации нет.
  const [hidden, setHidden] = useState(loadHidden);
  const put = (next: ReadonlySet<WorldLayer>) => {
    saveHidden(next);
    setHidden(next);
  };
  return {
    hidden,
    toggle: (layer) => put(toggleLayer(hidden, layer)),
    toggleAll: (anyOn) => put(toggleBuildings(hidden, anyOn)),
  };
}
