// Бета-рейд: standalone route → рендерит BetaRaidScreen.
//
// Шапку балансов рисуем и здесь: энергия показывается только в ней, а вход
// сюда разрешён напрямую (BetaGate) — без шапки игрок не видел бы, сколько
// у него энергии на ход и на бой.
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { StatsBar } from "@/components/chips/StatsBar";
import { BetaRaidScreen } from "@/components/beta-raid/BetaRaidScreen";

export const Route = createFileRoute("/beta-raid")({
  head: () => ({
    meta: [{ title: "Бета-рейд" }, { name: "robots", content: "noindex" }],
  }),
  component: BetaRaidPage,
});

function BetaRaidPage() {
  const navigate = useNavigate();
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <div className={fullscreen ? "" : "mx-auto flex max-w-2xl flex-col gap-2 p-2"}>
      {!fullscreen && <StatsBar showNftInput={false} />}
      <BetaRaidScreen onClose={() => navigate({ to: "/" })} fullscreen={fullscreen} onToggleFullscreen={() => setFullscreen((v) => !v)} />
    </div>
  );
}
