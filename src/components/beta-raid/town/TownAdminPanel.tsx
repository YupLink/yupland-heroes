// Пульт ратуши для админа: жители, правила города ползунками и товары.
// Игрок пульта не видит — у ратуши ему справка (TownExtra); админ открывает
// пульт кнопкой оттуда или в «Правке на живой карте».
//
// Файл — оркестратор: загрузка → форма → сохранение. Товары — в TownGoodsList
// (по категориям, добавление галками), чтобы держать лимит ≤250.
import { useEffect, useState } from "react";
import { Loader2, X, Save } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTownConfig, setTownConfig } from "@/server/api/beta-raid/town-config";
import {
  dailyNeed,
  emptyTownConfig,
  TOWN_NAME_MAX,
  type TownConfig,
  type TownGood,
} from "@/lib/townConfig";
import { humanError } from "@/lib/humanError";
import { TownGoodsList } from "./TownGoodsList";
import { TownRulesFields } from "./TownRulesFields";

export function TownAdminPanel({
  q,
  r,
  onClose,
  embedded = false,
}: {
  q: number;
  r: number;
  onClose: () => void;
  /** Встраиваемый режим: без модалки-обёртки и без своего заголовка — панель
   *  живёт внутри окна «Правка на живой карте», рядом с эффектом постройки. */
  embedded?: boolean;
}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["town-config", q, r],
    queryFn: () => getTownConfig({ data: { q, r } }),
    staleTime: 5_000,
  });

  const [draft, setDraft] = useState<TownConfig>(() => emptyTownConfig());
  const [loaded, setLoaded] = useState(false);
  // Подтягиваем ответ сервера в форму ОДИН раз: дальше форма — черновик админа,
  // и перечитанный конфиг не должен затирать правки (удалил последний товар при
  // нуле жителей — форма раньше откатывалась к сохранённой версии).
  useEffect(() => {
    if (!loaded && query.data?.config) {
      // Ответ сервера до выката названий приходит без name — поле не падает.
      setDraft({ ...query.data.config, name: query.data.config.name ?? "" });
      setLoaded(true);
    }
  }, [query.data, loaded]);

  const save = useMutation({
    mutationFn: () => setTownConfig({ data: { q, r, config: draft } }),
    onSuccess: () => {
      toast.success("Ратуша сохранена");
      qc.invalidateQueries({ queryKey: ["town-config", q, r] });
      // Цены и витрины лавок города зависят от пульта — перечитать открытые окна.
      qc.invalidateQueries({ queryKey: ["beta-raid-building"] });
      // Название города — в списке ратуш у настройки лавки.
      qc.invalidateQueries({ queryKey: ["shop-town"] });
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Опора баланса: еда за сутки по цене ×1 — столько золота город раздаёт
  // игрокам в сутки, когда запасы держатся у нормы.
  const eatGold =
    Math.round(
      draft.goods.reduce((s, g) => s + dailyNeed(g, draft.residents) * g.marketPrice, 0) * 100,
    ) / 100;

  const updateGood = (id: string, patch: Partial<TownGood>) => {
    setDraft((d) => ({
      ...d,
      goods: d.goods.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  };
  const removeGood = (id: string) => {
    setDraft((d) => ({ ...d, goods: d.goods.filter((g) => g.id !== id) }));
  };
  // Пачка из окна выбора: товары уже с ценой и расходом по умолчанию.
  const addGoods = (goods: TownGood[]) => {
    setDraft((d) => ({ ...d, goods: [...d.goods, ...goods] }));
  };

  const title = draft.name.trim();
  const body = (
    <>
      {/* Своя прокрутка — только у отдельного окна. Встроенный пульт листает
          окно клетки: вложенный overflow-auto с overscroll-contain в WebView
          на Chromium до 108 ловил свайп и колесо и никуда их не пускал — окно
          стояло, пока палец не попадёт на шапку (жалоба 04.10: 33 свайпа из
          216 доходили до окна, без вложенной прокрутки — все). */}
      <div className={embedded ? "p-3" : "min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"}>
        {query.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </div>
        ) : (
          <div className="space-y-3">
            {query.data?.starvingSince && (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-center text-xs font-bold text-destructive">
                Город голодает с {new Date(query.data.starvingSince).toLocaleString("ru-RU")}
              </div>
            )}
            {/* Название города — по нему ратушу выбирают при привязке лавки и
                узнают в окне ратуши (владелец, 05.10.2026). */}
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
                Название города
              </span>
              <input
                type="text"
                maxLength={TOWN_NAME_MAX}
                value={draft.name}
                placeholder="Город Вихоток"
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
                Жителей
              </span>
              <input
                type="number"
                min={0}
                step={1}
                value={draft.residents}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setDraft((d) => ({
                    ...d,
                    residents: Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0,
                  }));
                }}
                className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
              />
            </label>
            {eatGold > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Город съедает в сутки на{" "}
                <b className="text-foreground">{eatGold.toLocaleString("ru-RU")}</b> золота по цене
                ×1
              </p>
            )}

            <TownRulesFields
              rules={draft.rules}
              onChange={(patch) => setDraft((d) => ({ ...d, rules: { ...d.rules, ...patch } }))}
            />

            <TownGoodsList
              goods={draft.goods}
              residents={draft.residents}
              rules={draft.rules}
              stock={query.data?.stock}
              lowSince={query.data?.lowSince}
              area={query.data?.area}
              onChange={updateGood}
              onDelete={removeGood}
              onAdd={addGoods}
            />
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Сохранить
        </button>
      </footer>
    </>
  );
  if (embedded) {
    return (
      <div className="mt-2 rounded-2xl border border-border/70 bg-secondary/30">
        <div className="border-b border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Ратуша{title ? ` «${title}»` : ""} · {q},{r}
        </div>
        {body}
      </div>
    );
  }
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-background sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Ратуша · настройки
            </div>
            <h3 className="truncate font-display text-lg font-bold">
              {title || `Ратуша @ ${q},${r}`}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {body}
      </div>
    </div>
  );
}
