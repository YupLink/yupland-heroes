import { useEffect } from "react";
import { getRaidWeather } from "@/server/api/beta-raid/weather/weather-get";
import { createWorldArrival, subscribeWorldArrival } from "./worldArrival";
import "./world-arrival.css";

/** Mounted at raid-screen lifetime, outside the building window closed by onDone. */
export function useWorldArrival() {
  useEffect(() => {
    const arrival = createWorldArrival({
      // Existing player-facing worldName contract, also used by the weather HUD.
      // Read only after successful travel, with the actual returned destination ID.
      read: (mapId) => getRaidWeather({ data: { mapId } }),
      show: (worldName) => {
        const layer = document.createElement("div");
        layer.className = "raid-world-arrival";
        layer.setAttribute("role", "status");
        layer.setAttribute("aria-live", "polite");
        layer.setAttribute("aria-atomic", "true");
        const title = document.createElement("h1");
        title.textContent = worldName;
        layer.append(title);
        document.body.append(layer);
        return () => layer.remove();
      },
    });
    const unsubscribe = subscribeWorldArrival((mapId) => { void arrival.arrive(mapId); });
    return () => {
      unsubscribe();
      arrival.dispose();
    };
  }, []);
}
