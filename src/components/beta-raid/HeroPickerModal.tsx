// Выбор основного героя и его отряда — прямо с карты рейда.
//
// Основной герой один на аккаунт и меняется раз в сутки: об этом сказано до
// подтверждения, чтобы выбор был осознанным. Отряд (до десяти фишек) закреплён
// за героем — им он и будет сражаться.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Swords, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { listMyHeroes } from "@/server/api/heroes-read";
import { selectMyHero, getMySelectedHero } from "@/server/api/heroes-select";
import { getMyHeroSquad, setMyHeroSquad } from "@/server/api/heroes-squad";
import { ChipSquadPicker, type LineChip } from "@/components/game/ChipSquadPicker";
import { metaLabel } from "@/components/heroMeta";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateHeroQueries } from "@/lib/query";
import { HeroPickerCard } from "./HeroPickerCard";
import { heroPickSettled, isCurrentHero, isFramedHero } from "./heroPickFrame";
import { FieldRecallConfirm } from "./FieldRecallConfirm";
import { useNowTick } from "@/components/chips/chipBusy";

// Те же цвета, что в карточках героев; подписи редкости берём из metaLabel.
const RARITY_COLOR: Record<string, string> = {
  rare: "#5b9bff",
  epic: "#b46bff",
  legendary: "#f5c451",
};

function hoursLeft(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 3600_000));
}

export function HeroPickerModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const lang = useLang();
  const t = useT();
  // У спящего героя id ещё нет — держим и шаблон.
  const [pending, setPending] = useState<{
    id: string | null;
    templateId: string;
    itemId?: string | null;
  } | null>(null);
  // Батрачащий герой: предлагаем снять его с грядки прямо отсюда — даром, но
  // потом он отдыхает.
  const [recall, setRecall] = useState<{ id: string; at: string } | null>(null);
  const [squadOpen, setSquadOpen] = useState(false);
  // Один тик на экран: по нему отдыхающие гаснут и оживают без F5.
  const now = useNowTick(10_000);

  const heroes = useQuery({ queryKey: ["my-heroes"], queryFn: () => listMyHeroes() });
  const selected = useQuery({ queryKey: ["my-selected-hero"], queryFn: () => getMySelectedHero() });
  const squadQ = useQuery({ queryKey: ["my-hero-squad"], queryFn: () => getMyHeroSquad() });

  const [lineup, setLineup] = useState<LineChip[]>([]);
  const squadLoaded = squadQ.data?.squad;
  if (squadLoaded && lineup.length === 0 && squadLoaded.length > 0 && !squadOpen) {
    setLineup(squadLoaded as LineChip[]);
  }

  const lockedHours = hoursLeft(selected.data?.switchAvailableAt);
  const hasHero = !!selected.data?.heroId;

  const pick = useMutation({
    // Спящего героя (без экземпляра) выбираем по шаблону — сервер заведёт
    // запись на лету, иначе половина коллекции невыбираема.
    mutationFn: (h: { id: string | null; templateId: string; itemId?: string | null }) =>
      selectMyHero({
        data: {
          heroId: h.id,
          itemId: h.id ? undefined : (h.itemId ?? undefined),
          templateId: h.id ? undefined : h.templateId,
        },
      }),
    onSuccess: async () => {
      toast.success(t("braid.main_hero_set"));
      // Сменили основного — поехали и статы, и снаряжение, и фигурка на карте.
      invalidateHeroQueries(qc, ["my-energy"]);
      // «Тапнутого» снимаем, когда придут новые список и основной: иначе рамка
      // на миг прыгала обратно на прежнего героя.
      await heroPickSettled(qc);
      setPending(null);
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      setPending(null);
    },
  });

  const saveSquad = useMutation({
    mutationFn: () =>
      setMyHeroSquad({
        data: {
          squad: lineup.slice(0, squadQ.data?.slots ?? 10).map((c) => ({
            templateId: c.templateId,
            level: c.level,
            serialNo: c.serialNo ?? null,
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success(t("braid.squad_saved_toast", { n: r.count }));
      qc.invalidateQueries({ queryKey: ["my-hero-squad"] });
      setSquadOpen(false);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-background sm:max-h-[88vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between p-4 pb-2">
          <h3 className="font-display text-base font-bold">
            {squadOpen ? t("braid.hero_squad") : t("braid.main_hero")}
          </h3>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:pb-4">
          {squadOpen ? (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                {t("braid.squad_hint", { n: squadQ.data?.slots ?? 10 })}
              </p>
              <ChipSquadPicker lineup={lineup} setLineup={setLineup} />
              <button
                onClick={() => saveSquad.mutate()}
                disabled={saveSquad.isPending}
                className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
              >
                {saveSquad.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("braid.squad_save")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                {t("braid.hero_pick_hint")}
                {lockedHours > 0 && t("braid.hero_switch_in", { n: lockedHours })}.
              </p>

              {heroes.isLoading ? (
                <div className="flex h-24 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-gold" />
                </div>
              ) : (heroes.data ?? []).length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  {t("braid.no_heroes")}
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(heroes.data ?? []).map((h) => (
                    <HeroPickerCard
                      key={h.id ?? h.itemId ?? h.templateId}
                      hero={h}
                      chosen={isCurrentHero(h, selected.data?.heroId)}
                      framed={isFramedHero(h, pending, selected.data?.heroId)}
                      now={now}
                      onPick={() => {
                        // Батрачащий герой занят: вместо тупика «сначала сними
                        // с поля» предлагаем снять его отсюда (даром, с отдыхом).
                        const busy = h.busyField && h.id ? { id: h.id, at: h.busyField } : null;
                        setRecall(busy);
                        setPending(
                          busy || isCurrentHero(h, selected.data?.heroId)
                            ? null
                            : { id: h.id, templateId: h.templateId, itemId: h.itemId },
                        );
                      }}
                    />
                  ))}
                </div>
              )}

              {pending && (
                <div className="space-y-2 rounded-xl border border-gold/40 bg-gold/5 p-3">
                  <p className="text-xs">{t("braid.make_main_q")}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => pick.mutate(pending)}
                      disabled={pick.isPending}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
                    >
                      {pick.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {t("common.confirm")}
                    </button>
                    <button
                      onClick={() => setPending(null)}
                      className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              )}

              {recall && (
                <FieldRecallConfirm
                  heroId={recall.id}
                  at={recall.at}
                  onClose={() => setRecall(null)}
                />
              )}

              {hasHero && (
                <button
                  onClick={() => setSquadOpen(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border px-4 py-3 text-sm font-bold transition hover:border-gold/40"
                >
                  <Swords className="h-4 w-4 text-gold" />
                  {t("braid.hero_squad")}
                  {squadQ.data?.squad.length ? ` · ${squadQ.data.squad.length}` : ""}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
