// Approved cabinet presentation. All bets, outcomes and credits still come from slotAct.
import { useEffect, useState } from "react";
import type { ClientAction } from "@/lib/slot/serverStep";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { useSlotGame } from "@/lib/slot/useSlotGame";
import { getSession } from "@/server/api/user-auth";
import { SlotAdminStats } from "./SlotAdminStats";
import { SlotCabinet } from "./cabinet/SlotCabinet";
import { BonusNotice, BonusEnd } from "./cabinet/BonusNotice";
import { DigScene } from "./cabinet/DigScene";
import { CaveScene } from "./cabinet/CaveScene";
import { RiskScene } from "./cabinet/RiskScene";

export function SlotScreen({ onClose }: { onClose?: () => void } = {}) {
  const ru = useLang() === "ru",
    navigate = useNavigate();
  const game = useSlotGame({ manualPresentation: true });
  const [statsOpen, setStatsOpen] = useState(false);
  const [bonusReceipt, setBonusReceipt] = useState<number | undefined>();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  const act = async (action: ClientAction) => {
    const result = await game.act(action);
    if (result && action.type === "bonus-finish")
      setBonusReceipt(result.state.bonusTotal);
    return result;
  };
  useEffect(() => {
    if (game.state.phase !== "idle") setBonusReceipt(undefined);
  }, [game.state.phase]);
  const props = { state: game.state, act, acting: game.acting, ru };
  const close = async () => {
    if (game.acting || game.state.phase === "spinning") return;
    // Spin winnings are already credited by the server; leaving does not debit or replay.
    if (game.state.auto) game.dispatch({ type: "toggle-auto" });
    if (
      game.state.phase === "risk" &&
      !(await act({
        type: game.state.pending > 0 ? "risk-take" : "risk-close",
      }))
    )
      return;
    if (onClose) onClose();
    else void navigate({ to: "/chips" });
  };
  return (
    <>
      <SlotCabinet
        api={{
          ...game,
          act,
          displayWin: bonusReceipt,
          ru,
          close: () => void close(),
        }}
        showLines={game.showLines}
        retry={() => void game.retry()}
        onStats={session.data?.isAdmin ? () => setStatsOpen(true) : undefined}
      >
        {game.state.phase === "bonus-won" && <BonusNotice {...props} />}
        {game.state.phase === "bonus" && game.state.bonus && (
          <DigScene {...props} />
        )}
        {game.state.phase === "super" && game.state.superGame && (
          <CaveScene {...props} />
        )}
        {game.state.phase === "risk" && game.state.risk && (
          <RiskScene {...props} />
        )}
        {game.state.phase === "bonus-end" && <BonusEnd {...props} />}
      </SlotCabinet>
      {session.data?.isAdmin && (
        <SlotAdminStats open={statsOpen} onClose={() => setStatsOpen(false)} />
      )}
    </>
  );
}
