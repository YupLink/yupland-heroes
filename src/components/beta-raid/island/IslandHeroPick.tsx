// Герой в подарок острова: игрок выбирает расу (Архан через владельца, 19.10.2026:
// «комон герой в подарок (человек выбирает расу)»; 20.10 — «сразу, не из
// сундука»): выбранный герой сразу в героях. Слой 150 — как окна острова.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getIslandHeroPick, getMyIslandHero, pickIslandHero } from "@/server/api/beta-raid/island/island-api";
import { serverErrorText } from "@/lib/serverErrorText";
import { invalidateHeroQueries } from "@/lib/query";
import { useLang, useT } from "@/lib/i18n";
import { raceGuide } from "@/lib/hero/raceGuide";
import { ISLAND_KEY } from "./useIsland";
import { IslandSkipControl } from "./IslandSkipControl";
import "./island.css";

import { thumb } from "@/lib/image";
const PICK_KEY = ["island-hero-pick"] as const;

const racePreviewArt: Record<string, string> = {
  Пчела: "/heroes/bee.webp",
  Кабан: "/heroes/boar.webp",
  ДраКошка: "/heroes/dracat.webp",
  Юпик: "/heroes/yupik.webp",
  Единорог: "/heroes/unicorn.webp",
  Дракон: "/heroes/dragon.webp",
};
const specializationEffect: Record<string, string> = {
  Маг: "Может взять с собой больше заклинаний.",
  Воин: "Сражается за счёт силы расы и снаряжения. Особого бонуса специализации нет.",
  Торговец: "У него вместительный рюкзак. Позже он сможет купить магический сундук.",
  Ассасин: "У него больше сытости, а по мере прокачки появится больше места для зелий.",
  Путешественник: "У него вместительный рюкзак — можно увезти больше добычи.",
  Строитель: "На верфи он сможет купить корабль дешевле.",
};

/** Нужен ли выбор и из кого; спрашиваем только на своём острове. */
export function useIslandHeroPick(enabled: boolean) {
  return useQuery({ queryKey: PICK_KEY, queryFn: () => getIslandHeroPick(), enabled });
}

export function IslandHeroPick({
  options,
  skipped,
  tutorialPilot,
  onContinue,
}: {
  options: Array<{ id: string; name: string; race: string; image: string | null }>;
  skipped: boolean;
  tutorialPilot: boolean;
  onContinue?: () => void;
}) {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const qc = useQueryClient();
  const existingHero = useQuery({
    queryKey: ["island-existing-hero"],
    queryFn: getMyIslandHero,
    enabled: tutorialPilot && !skipped,
  });
  const replayHero = existingHero.data?.hero ?? null;
  const [later, setLater] = useState(false);
  const [selected, setSelected] = useState<(typeof options)[number] | null>(null);
  const raceDetail = selected ? raceGuide(selected.race, lang) : undefined;
  const [result, setResult] = useState<{
    race: string;
    image: string | null;
    specialization: string | null;
    rarity: string;
    alreadyHad: boolean;
  } | null>(null);
  const previewArt = (race: string, fallback: string | null) =>
    racePreviewArt[t(`tags.race.${race}`)] ?? fallback;
  const pick = useMutation({
    mutationFn: (templateId: string) => pickIslandHero({ data: { templateId } }),
    onSuccess: async (response) => {
      if (replayHero) {
        continueAfterPick();
        return;
      }
      if (tutorialPilot && !skipped) {
        const hero =
          response.hero ?? (await getMyIslandHero().then((r) => r.hero).catch(() => null));
        if (!hero) {
          toast.error(
            lang === "ru"
              ? "Не удалось показать героя. Повтори выбор."
              : "Could not show the hero. Try again.",
          );
          return;
        }
        setResult({
          race: hero.race?.[lang] ?? hero.name[lang],
          image: hero.image ?? (hero.race ? racePreviewArt[hero.race.ru] ?? null : null),
          specialization: hero.specialization?.[lang] ?? null,
          rarity: hero.rarity[lang],
          alreadyHad: hero.alreadyHad,
        });
        return;
      }
      toast.success(t("island.hero_pick.done"));
      void qc.invalidateQueries({ queryKey: PICK_KEY });
      void qc.invalidateQueries({ queryKey: ISLAND_KEY });
      invalidateHeroQueries(qc);
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });
  if (later || options.length === 0 || (tutorialPilot && !skipped && existingHero.isPending)) return null;
  const shownHero = result ?? (replayHero ? {
    race: replayHero.race?.[lang] ?? replayHero.name[lang],
    image: replayHero.image ?? (replayHero.race ? racePreviewArt[replayHero.race.ru] ?? null : null),
    specialization: replayHero.specialization?.[lang] ?? null,
    rarity: replayHero.rarity[lang],
    alreadyHad: true,
  } : null);
  const continueAfterPick = () => {
    setLater(true);
    onContinue?.();
    void qc.invalidateQueries({ queryKey: PICK_KEY });
    void qc.invalidateQueries({ queryKey: ISLAND_KEY });
    invalidateHeroQueries(qc);
  };
  if (tutorialPilot && (!skipped || result))
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (open || pick.isPending) return;
          if (replayHero) pick.mutate(replayHero.templateId);
          else if (result) continueAfterPick();
          else if (selected) setSelected(null);
          else setLater(true);
        }}
      >
        <DialogContent
          closeLabel={lang === "ru" ? "Закрыть" : "Close"}
          className={`island-dialog z-[150] ${shownHero ? "island-hero-reveal" : "island-heropick-guide"}`}
          overlayClassName="z-[149]"
        >
          {!shownHero && (
            <div className="island-dialog__skip">
              <IslandSkipControl skipped={false} />
            </div>
          )}
          {shownHero ? (
            <>
              <div className="island-dialog__skip">
                <IslandSkipControl skipped={false} />
              </div>
              <p className="island-hero-reveal__eyebrow">
                {shownHero.alreadyHad
                  ? lang === "ru" ? "Герой уже у тебя" : "You already own this hero"
                  : lang === "ru" ? "Подарок первого входа" : "First visit gift"}
              </p>
              <DialogTitle className="island-dialog__title">
                {shownHero.alreadyHad
                  ? lang === "ru" ? "Это твой герой" : "This is your hero"
                  : lang === "ru" ? "Ура! Это твой герой" : "Your hero is here!"}
              </DialogTitle>
              <div
                className="island-hero-reveal__stage"
                aria-label={`${lang === "ru" ? (shownHero.alreadyHad ? "Твой герой" : "Получен герой") : (shownHero.alreadyHad ? "Your hero" : "Hero received")}: ${shownHero.race}${shownHero.specialization ? `, ${shownHero.specialization}` : ""}`}
              >
                {shownHero.image && <img src={thumb(shownHero.image, 400)} alt={lang === "ru" ? `Герой расы ${shownHero.race}` : `${shownHero.race} hero`} />}
              </div>
              <p className="island-hero-reveal__identity">
                <span>{shownHero.rarity}</span>
                <strong>{shownHero.race}</strong>
              </p>
              {shownHero.specialization && (
                <section
                  className="island-hero-reveal__specialization"
                  aria-label={lang === "ru" ? "Специализация героя" : "Hero specialization"}
                >
                  <p>
                    {shownHero.alreadyHad
                      ? lang === "ru" ? "Специализация героя" : "Hero specialization"
                      : lang === "ru" ? "Тебе выпала специализация" : "Your specialization"}
                  </p>
                  <strong>{shownHero.specialization}</strong>
                  {lang === "ru" && specializationEffect[shownHero.specialization] && (
                    <span>{specializationEffect[shownHero.specialization]}</span>
                  )}
                </section>
              )}
              <DialogDescription className="island-hero-reveal__hint">
                {shownHero.alreadyHad
                  ? (lang === "ru" ? "Это ранее выданный герой. При повторном обучении нового героя не дают." : "This is your existing hero. Restarting the tutorial does not grant another one.")
                  : shownHero.specialization
                    ? (lang === "ru" ? "Специализация определяет облик героя и его особенность." : "Specialization shapes your hero's appearance and abilities.")
                    : (lang === "ru" ? "Характеристики героя можно посмотреть в Таверне." : "You can view your hero's stats in the Tavern.")}
              </DialogDescription>
              <div className="island-dialog__actions">
                <button
                  type="button"
                  data-game-button="primary"
                  className="island-dialog__go"
                  disabled={pick.isPending}
                  onClick={() => replayHero ? pick.mutate(replayHero.templateId) : continueAfterPick()}
                >
                  {onContinue ? (lang === "ru" ? "Найти героя в таверне" : "Find your hero in the tavern") : (lang === "ru" ? "Исследовать территорию" : "Explore the island")}
                </button>
              </div>
            </>
          ) : (
            <>
              <DialogTitle className="island-dialog__title">
                {selected ? t(`tags.race.${selected.race}`) : "Выбери расу героя"}
              </DialogTitle>
              <DialogDescription className="island-dialog__text island-heropick-guide__lead">
                {selected
                  ? "Посмотри, чем сильна раса, перед выбором."
                  : "Герой обычной редкости — подарок первого входа."}
              </DialogDescription>
              {selected ? (
                <>
                  <div className="island-heropick-guide__detail">
                    {previewArt(selected.race, selected.image) && (
                      <img src={previewArt(selected.race, selected.image)!} alt="" />
                    )}
                    <div>
                      <strong>
                          {raceDetail?.strength ??
                          "Особенности расы"}{" "}
                        — что даёт
                      </strong>
                      <p>
                        {raceDetail?.effect ??
                          "Особенности героя можно посмотреть в его характеристиках."}
                      </p>
                    </div>
                  </div>
                  <p className="island-heropick-guide__rule">
                    Ты выбираешь расу. После подтверждения увидишь специализацию и характеристики
                    героя.
                  </p>
                  <div className="island-dialog__actions">
                    <button
                      type="button"
                      className="island-dialog__alt"
                      onClick={() => setSelected(null)}
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      data-game-button="primary"
                      className="island-dialog__go"
                      disabled={pick.isPending}
                      onClick={() => pick.mutate(selected.id)}
                    >
                      Подтвердить выбор
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="island-heropick-guide__grid">
                    {options.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="island-heropick-guide__card"
                        onClick={() => setSelected(o)}
                      >
                        <span>
                          {previewArt(o.race, o.image) && (
                            <img src={previewArt(o.race, o.image)!} alt="" loading="lazy" />
                          )}
                        </span>
                        <strong>{t(`tags.race.${o.race}`)}</strong>
                      </button>
                    ))}
                  </div>
                  <p className="island-heropick-guide__rule">
                    Выбираешь расу. Специализацию увидишь после подтверждения.
                  </p>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    );
  return (
    <Dialog open onOpenChange={(open) => !open && !pick.isPending && setLater(true)}>
      <DialogContent
        closeLabel={lang === "ru" ? "Закрыть" : "Close"}
        className="island-dialog z-[150]"
        overlayClassName="z-[149]"
      >
        {tutorialPilot && !skipped && (
          <div className="island-dialog__skip">
            <IslandSkipControl skipped={false} />
          </div>
        )}
        <DialogTitle className="island-dialog__title">{t("island.hero_pick.title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("island.hero_pick.title")}</DialogDescription>
        <div className="island-heropick">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="island-heropick__card"
              disabled={pick.isPending}
              onClick={() => pick.mutate(o.id)}
            >
              {o.image && <img src={thumb(o.image, 256)} alt="" loading="lazy" />}
              <span>{t(`tags.race.${o.race}`)}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

