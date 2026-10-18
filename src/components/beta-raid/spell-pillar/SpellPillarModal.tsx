// Окно СТОЛБА ЗАКЛИНАНИЙ: чему тут учат, почём и что герой уже знает.
//
// Витрину считает сервер (getSpellPillarOffer): он же говорит, можно ли учить
// каждое заклинание и почему нет — ключом словаря, потому что языка игрока не
// знает. Клиент ничего не решает сам: гасшая кнопка и текст отказа приходят из
// одного места, иначе окно писало бы «мало интеллекта» там, где сервер
// отвечает «нет мест».
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { serverErrorText } from "@/lib/serverErrorText";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { getSpellPillarOffer } from "@/server/api/beta-raid/spell-pillar";
import { forgetSpell, learnSpell } from "@/server/api/beta-raid/spell-learn";
import type { LearnResult } from "@/server/api/beta-raid/spell-learn";
import { priceText } from "../portalPriceText";
import { pillarPriceLine } from "./spellPillarText";
import { SpellPillarCard } from "./SpellPillarCard";
import { SpellForgetConfirm } from "../spellbook/SpellForgetConfirm";
import { invalidateBackpack } from "@/lib/query";

type Ask = { id: string; name: string; image: string | null };

export function SpellPillarModal({ q, r, onClose }: { q: number; r: number; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Забвение платное, а выученное назад — снова за плату: сперва спросим.
  const [ask, setAsk] = useState<Ask | null>(null);

  const offer = useQuery({
    queryKey: ["spell-pillar", q, r],
    queryFn: () => getSpellPillarOffer({ data: { q, r } }),
    staleTime: 5_000,
    retry: false,
  });
  const data = offer.data;

  /** Что врёт после изучения: витрина, кошелёк, энергия и книга героя. */
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["spell-pillar", q, r] });
    qc.invalidateQueries({ queryKey: RESOURCES_KEY });
    qc.invalidateQueries({ queryKey: ENERGY_KEY });
    qc.invalidateQueries({ queryKey: ["my-like-balance"] });
    qc.invalidateQueries({ queryKey: ["my-tickets"] });
    // Цена бывает и токеном (DARAI и прочие) — баланс счёта тоже.
    qc.invalidateQueries({ queryKey: ["acc-balances"] });
    invalidateBackpack(qc);
    // Книгу героя рисует соседний экран, и его ключ здесь не зашит: гасим всё,
    // в чьём имени есть «spell». Иначе выученное появлялось бы в книге только
    // после перезагрузки страницы.
    qc.invalidateQueries({
      predicate: (query) => String(query.queryKey[0] ?? "").includes("spell"),
    });
  };

  /** Отказ приходит ключом словаря и в ok:false, и в ok:true с repeat. */
  const done = (res: LearnResult, okKey: string, name: string) => {
    if (!res.ok) {
      toast.error(t(res.reasonKey, res.reasonParams));
      refresh();
      return;
    }
    // repeat — то же нажатие приехало дважды: второй раз ничего не списано.
    if (!res.repeat) toast.success(t(okKey, { name }));
    refresh();
  };

  // Ключ нажатия свой на каждое нажатие: им сервер и платит, и отличает
  // слепой повтор моста от честного второго изучения того же заклинания.
  const learn = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      learnSpell({ data: { q, r, spellId: v.id, op: newOpId() } }),
    onSuccess: (res, v) => done(res, "spellpillar.learned_toast", v.name),
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
    onSettled: () => setBusyId(null),
  });

  // Забвение у столба — за его «Цену забвения», по тому же ключу нажатия.
  // Героя шлём того, чью книгу показывает окно: сервер забудет только у своего.
  const forget = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      forgetSpell({
        data: { q, r, spellId: v.id, op: newOpId(), heroId: offer.data?.hero?.heroId },
      }),
    onSuccess: (res, v) => done(res, "spellpillar.forgot_toast", v.name),
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
    onSettled: () => setBusyId(null),
  });

  const run = (m: typeof learn, id: string, name: string) => {
    setBusyId(id);
    m.mutate({ id, name });
  };

  // Пустая цена изучения — ненастроенный столб, а не подарок: строку про цену
  // тогда не рисуем вовсе, красный отказ сервера скажет всё сам.
  const priceLine = data ? pillarPriceLine(data.learnPrices, data.forgetPrices, t) : null;
  const forgetPrices = data && Array.isArray(data.forgetPrices) ? data.forgetPrices : [];
  const forgetCost = forgetPrices.length > 0 ? priceText(forgetPrices, t) : null;
  const noSlots = !!data && data.slots.total > 0 && data.slots.free <= 0;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-gold/30 bg-background sm:max-h-[88vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between p-4 pb-2">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gold">
            <Wand2 className="h-3.5 w-3.5" />
            {t("spellpillar.title")}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Своя прокрутка тела и запас под нижнюю панель: на 360×640 список
            заклинаний длиннее экрана. */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:pb-4">
          {offer.isPending && (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          )}

          {offer.isError && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {serverErrorText(offer.error, t)}
            </p>
          )}

          {data && (
            <>
              {priceLine && (
                <p className="text-center text-[11px] text-muted-foreground">{priceLine}</p>
              )}

              {data.hero && (
                <p className="text-center text-[11px]">
                  <span className="text-muted-foreground">
                    {t("spellpillar.hero", { name: data.hero.name })}
                  </span>{" "}
                  <b className={noSlots ? "text-destructive" : "text-gold"}>
                    {t("spellpillar.slots", {
                      used: data.slots.used,
                      total: data.slots.total,
                    })}
                  </b>
                </p>
              )}

              {data.reasonKey && (
                <p className="rounded-xl border border-destructive/40 px-3 py-2 text-center text-[11px] text-destructive">
                  {t(data.reasonKey)}
                </p>
              )}

              {data.spells.length === 0 && !data.reasonKey && (
                <p className="py-6 text-center text-[11px] text-muted-foreground">
                  {t("spellpillar.empty")}
                </p>
              )}

              {data.spells.map((s) => (
                <SpellPillarCard
                  key={s.id}
                  spell={s}
                  canForget={!!forgetCost}
                  busy={busyId === s.id}
                  onLearn={() => run(learn, s.id, s.name)}
                  onForget={() => setAsk({ id: s.id, name: s.name, image: s.image })}
                />
              ))}
            </>
          )}
        </div>

        {ask && (
          <SpellForgetConfirm
            name={ask.name}
            image={ask.image}
            price={forgetCost}
            busy={false}
            onCancel={() => setAsk(null)}
            onConfirm={() => {
              setAsk(null);
              run(forget, ask.id, ask.name);
            }}
          />
        )}
      </div>
    </div>
  );
}
