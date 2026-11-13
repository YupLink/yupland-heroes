// Выбор расы героя на старте: шесть обычных героев (по одному на расу, тот же
// список, что у героя острова). Карточка открывает описание расы, затем
// игрок подтверждает разовый выбор.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { startGame, type GameStartOption } from "@/server/api/game-start";
import { serverErrorText } from "@/lib/serverErrorText";
import { invalidateHeroQueries } from "@/lib/query";
import { useLang, useT } from "@/lib/i18n";
import { raceGuide } from "@/lib/hero/raceGuide";
import { GAME_START_KEY } from "./useGameStart";
import { InviteText } from "@/components/referrals/InviteLine";
import type { InviteWho } from "@/lib/referralShare";
import "@/components/castle-live/castle-gate-dialog.css";
import "./game-start.css";

export function GameStartRacePick({
  options,
  invite = null,
  onClose,
  onDone,
}: {
  options: GameStartOption[];
  /** Позвал друг — строка «Тебя пригласил… — подарок ждёт» над выбором. */
  invite?: InviteWho | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();
  const [chosen, setChosen] = useState<GameStartOption | null>(null);
  const finish = () => {
    onDone();
    void qc.invalidateQueries({ queryKey: [GAME_START_KEY] });
  };
  const start = useMutation({
    mutationFn: (templateId: string) => startGame({ data: { templateId } }),
    onSuccess: (res) => {
      // Герой лёг в инвентарь (my-game-items) — списки героев и меню перечитываем.
      invalidateHeroQueries(qc);
      // Новичка встретил свой остров: карта другая — всё, что знало прежнюю.
      if (res.island) {
        void qc.invalidateQueries({
          predicate: (q) => String(q.queryKey[0] ?? "").startsWith("beta-raid"),
        });
        void qc.invalidateQueries({ queryKey: ["home-castle"] });
      }
      // Keep the entry screen mounted while the player reads the confirmed result.
      if (!res.granted) finish();
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  const granted = start.data?.granted === true;
  // Шесть картинок рас — один раз при открытии: «Назад» и следующая раса без
  // перезагрузки и мигания (владелец, 13.11.2026: «моргает и грузится заново»).
  useEffect(() => {
    for (const o of options) if (o.image) new Image().src = o.image;
  }, [options]);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (chosen) title.current?.focus();
  }, [chosen, granted]);
  const raceName = chosen ? t(`tags.race.${chosen.race}`) : null;
  const race = chosen ? raceGuide(chosen.race, lang) : null;
  const close = () => {
    if (start.isPending) return;
    if (granted) finish();
    else if (chosen) setChosen(null);
    else onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        closeLabel={t("start.close")}
        className="castle-gate-dialog game-start-pick z-[150]"
        overlayClassName="z-[149]"
      >
        <DialogTitle ref={title} tabIndex={-1} className="castle-gate-dialog__title">
          {granted ? t("start.hero_received") : raceName ?? t("start.pick_title")}
        </DialogTitle>
        <DialogDescription className="game-start-pick__description">
          {granted
            ? t(start.data?.island ? "start.hero_in_tavern" : "start.hero_owned")
            : t(chosen ? "start.race_specialization" : "start.race_preview")}
        </DialogDescription>
        {chosen && (
          <>
            <div className="game-start-pick__detail">
              {chosen.image && <img src={chosen.image} alt="" />}
              <div>
                {granted && <p className="game-start-pick__hero-name">{chosen.name} · {raceName}</p>}
                {race && <><strong>{race.strength}</strong><p>{race.effect}</p></>}
              </div>
            </div>
            <div className="castle-gate-dialog__actions">
              {granted ? (
                <button type="button" className="castle-gate-dialog__leave" onClick={finish}>
                  {t(start.data?.island ? "start.find_hero" : "start.continue")}
                </button>
              ) : (
                <>
                  <button type="button" className="castle-gate-dialog__stay" disabled={start.isPending} onClick={close}>
                    {t("start.back")}
                  </button>
                  <button type="button" className="castle-gate-dialog__leave" disabled={start.isPending} onClick={() => start.mutate(chosen.id)}>
                    {t(start.isPending ? "start.starting" : "start.confirm_race")}
                  </button>
                </>
              )}
            </div>
          </>
        )}
        {/* Сетка не размонтируется, а прячется: картинки не грузятся заново. */}
        <div hidden={!!chosen}>
          {invite && <InviteText who={invite} className="text-center text-xs font-semibold text-gold" />}
          <div className="game-start-pick__grid">
            {options.map((option) => (
              <button key={option.id} type="button" className="game-start-pick__card" onClick={() => setChosen(option)}>
                {option.image && <img src={option.image} alt="" />}
                <span>{t(`tags.race.${option.race}`)}</span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
