import { AnomalyWeather } from "./visuals/AnomalyWeather";
import { FrostHud } from "./visuals/FrostHud";
import { WeatherLayer } from "./visuals/WeatherLayer";
import { weatherBandOf, weatherAnomalyOf } from "@/lib/raid/weather";
import type { WeatherTemperature, WeatherCamera } from "./visuals/WeatherLayer";
import { useQuery } from "@tanstack/react-query";
import { memo, useEffect, useState } from "react";
import { getRaidWeather } from "@/server/api/beta-raid/weather/weather-get";
import { RaidWeatherPanel } from "./RaidWeatherPanel";

/** Read-only presentation of the server's currently applied coefficients. */
function RaidWeatherHudView({
  mapId,
  ru,
  isAdmin = false,
  visualsEnabled = true,
  camera,
}: {
  mapId: string;
  ru: boolean;
  isAdmin?: boolean;
  visualsEnabled?: boolean;
  camera?: WeatherCamera;
}) {
  const weather = useQuery({
    queryKey: ["raid-weather", mapId],
    queryFn: () => getRaidWeather({ data: { mapId } }),
    enabled: !!mapId,
    staleTime: 30_000,
    retry: 1,
    refetchInterval: (query) => {
      const nextAt = query.state.data?.nextAt;
      return nextAt && nextAt > Date.now()
        ? Math.max(1_000, Math.min(30_000, nextAt - Date.now()))
        : 30_000;
    },
    refetchIntervalInBackground: false,
  });
  const data = weather.data;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!data) return;
    const timer = window.setTimeout(
      // Expire the displayed reading; React Query owns network scheduling.
      () => tick((n) => n + 1),
      Math.max(0, data.nextAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [data?.nextAt]);
  // No fabricated weather on beginner islands, failed requests or map changes.
  if (!data || weather.isError || data.mapId !== mapId || Date.now() >= data.nextAt) return null;
  const temperatures: Record<ReturnType<typeof weatherBandOf>["band"], WeatherTemperature> = {
    very_cold: "very-cold",
    cold: "cold",
    cool: "mild",
    warm: "warm",
    hot: "hot",
  };
  const anomaly = weatherAnomalyOf(data.temperatureC);
  return (
    <>
      {visualsEnabled && Number.isFinite(data.temperatureC) && (
        <FrostHud temperature={temperatures[weatherBandOf(data.temperatureC).band]} />
      )}
      {visualsEnabled && Number.isFinite(data.temperatureC) && anomaly !== "heat" && (
        <WeatherLayer
          camera={camera}
          kind={data.kind}
          temperature={temperatures[weatherBandOf(data.temperatureC).band]}
        />
      )}
      {visualsEnabled && Number.isFinite(data.temperatureC) && anomaly && (
        <AnomalyWeather mode={anomaly === "heat" ? "infernal" : "frozen"} />
      )}
      <RaidWeatherPanel
        isAdmin={isAdmin}
        ru={ru}
        degrees={data.temperatureC}
        kind={data.kind}
        coefs={data.coefs}
        effectsOn={data.effectsOn}
        worldName={data.worldName ?? null}
      />
    </>
  );
}

// memo: экран рейда перерисовывается на каждый шаг героя, а этому компоненту
// шаг ни при чём — без memo он с иконками шёл следом (замер 06.11.2026).
// Камеру экран отдаёт новым объектом на каждый кадр React, а внутри — те же ref'ы.
export const RaidWeatherHud = memo(
  RaidWeatherHudView,
  (a, b) =>
    a.mapId === b.mapId &&
    a.ru === b.ru &&
    a.isAdmin === b.isAdmin &&
    a.visualsEnabled === b.visualsEnabled &&
    a.camera?.offsetRef === b.camera?.offsetRef &&
    a.camera?.scaleRef === b.camera?.scaleRef &&
    a.camera?.heroRef === b.camera?.heroRef &&
    a.camera?.rainPoint === b.camera?.rainPoint &&
    a.camera?.onSnowStage === b.camera?.onSnowStage &&
    a.camera?.onPuddles === b.camera?.onPuddles,
);


