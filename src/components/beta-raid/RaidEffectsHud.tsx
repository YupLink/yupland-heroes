import { useQuery } from "@tanstack/react-query";
import { getBetaRaidState } from "@/server/api/beta-raid";
import { CastleEffectsStrip } from "./CastleEffectsStrip";
import "./raid-hud-layout.css";
export function RaidEffectsHud({ ru }: { ru: boolean }) {
  const state = useQuery({ queryKey: ["beta-raid-state"], queryFn: () => getBetaRaidState() });
  return <div className="raid-world-effects"><CastleEffectsStrip iconArt="/resources/raid-hud-art-effects.webp" lang={ru ? "ru" : "en"} effects={state.data?.effects} status={state.isError ? "error" : state.isPending ? "loading" : "ready"} onRetry={() => void state.refetch()} /></div>;
}
