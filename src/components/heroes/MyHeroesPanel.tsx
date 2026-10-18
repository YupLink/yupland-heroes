import { heroAbilityLabel } from "@/lib/hero/heroAbilities";
import { ConvertToHeroModal } from "./ConvertToHeroModal";
// Тестовая песочница механики героев (пока только админам, см. api/heroes.ts).
// Показывает своих героев с лепестковой диаграммой характеристик, позволяет
// повышать уровень за лайки и превращать фишки 3★+ в героев.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crown, Loader2, ArrowUpCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { listMyHeroes, levelUpHero, levelUpHeroTemplate } from "@/server/api/heroes";
import { myChipInventory } from "@/server/api/chips";
import { HeroRadar } from "./HeroRadar";
import { thumb } from "@/lib/image";
import { convertRuleForChipLevel } from "@/lib/heroLevels";
import { humanError } from "@/lib/humanError";
import { invalidateHeroQueries } from "@/lib/query";

const RARITY_COLOR: Record<string, string> = {
  // Обычный — серый: он есть в игре (стартовый герой), и без него подпись
  // и рамка у него пустовали (жалоба 16.09.2026).
  common: "#9ca3af",
  rare: "#5b9bff",
  epic: "#b46bff",
  legendary: "#f5c451",
};
const RARITY_LABEL: Record<string, string> = {
  common: "Обычный",
  rare: "Редкий",
  epic: "Эпический",
  legendary: "Легендарный",
};

export function MyHeroesPanel() {
  const qc = useQueryClient();
  const heroes = useQuery({ queryKey: ["my-heroes"], queryFn: () => listMyHeroes() });
  const [convertOpen, setConvertOpen] = useState(false);

  // У «спящего» героя (лежит предметом, экземпляра ещё нет) id отсутствует —
  // такого качаем по КОПИИ предмета: у игрока их бывает несколько одного вида,
  // и без itemId прокачка уходила в самого прокачанного («перебрасывает на
  // другого героя такого же, который выше левлом»).
  const levelUp = useMutation({
    mutationFn: (h: {
      id: string | null;
      templateId: string;
      itemId?: string | null;
      level: number;
      nextCost: number | null;
    }) =>
      h.id
        ? levelUpHero({
            data: { heroId: h.id },
          })
        : levelUpHeroTemplate({
            data: {
              templateId: h.templateId,
              ...(h.itemId ? { itemId: h.itemId } : {}),
            },
          }),
    onSuccess: (r) => {
      toast.success(
        `Уровень ${r.level} · −${r.spentLikes} лайков (осталось ${r.likesLeft.toFixed(2)})`,
      );
      // Прокачка видна не только здесь: карточка героя в инвентаре, плашка
      // основного и карта рейда считают уровень тем же числом. Один список
      // ключей на все геройские мутации — см. lib/query.
      invalidateHeroQueries(qc, ["my-like-balance"]);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Список: убираем дубли по стабильному ключу. Регрессия «показывает
  // четверых, тапаешь на 7 lvl — качает 20 lvl»: у нескольких спящих одного
  // шаблона был id=null, React ключ = null у всех, состояние путалось.
  // dedupe по «инст-id или item-id (уникальны в БД)», иначе templateId (для
  // самых старых записей).
  const raw = heroes.data ?? [];
  const seen = new Set<string>();
  const list = raw.filter((h) => {
    const key = h.id ?? h.itemId ?? `tpl:${h.templateId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/15 text-gold">
            <Crown className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold">Мои герои</h2>
            <p className="text-[11px] text-muted-foreground">Тест механики · пока только админам</p>
          </div>
        </div>
        <button
          onClick={() => setConvertOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-neon/40 bg-neon/10 px-3 py-1.5 text-xs font-bold text-neon transition active:scale-95"
        >
          <Sparkles className="h-3.5 w-3.5" /> Из фишки
        </button>
      </div>

      {convertOpen && <ConvertBlock onDone={() => setConvertOpen(false)} />}

      {heroes.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-8 text-center text-xs text-muted-foreground">
          Героев пока нет — преврати фишку от 3★ кнопкой «Из фишки».
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((h) => {
            const color = RARITY_COLOR[h.rarity] ?? "#9aa4bd";
            const atMax = h.nextCost == null;
            // Ключ рендера ЖЁСТКО уникален: спящих у одного шаблона может
            // быть несколько с id=null — тогда React мешал состояния.
            const rowKey = h.id ?? h.itemId ?? `tpl:${h.templateId}`;
            return (
              <div
                key={rowKey}
                className="rounded-2xl border bg-card p-3"
                style={{ borderColor: color + "55" }}
              >
                <div className="mb-2 flex items-center gap-2">
                  {h.imageUrl ? (
                    <img
                      src={thumb(h.imageUrl, 96)}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <span
                      className="grid h-12 w-12 place-items-center rounded-lg bg-secondary text-xl"
                      style={{ color }}
                    >
                      ♞
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{h.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {[h.race, h.specialization, heroAbilityLabel(h.ability, "ru")]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                        style={{ background: color + "22", color }}
                      >
                        {RARITY_LABEL[h.rarity] ?? h.rarity}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ур. {h.level}/{h.maxLevel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Значения подписаны прямо на осях — списком их не дублируем. */}
                <div className="flex justify-center py-1">
                  <HeroRadar stats={h.stats} size={230} />
                </div>

                <button
                  onClick={() =>
                    levelUp.mutate({
                      id: h.id,
                      templateId: h.templateId,
                      itemId: h.itemId,
                      level: h.level,
                      nextCost: h.nextCost,
                    })
                  }
                  disabled={
                    atMax ||
                    (levelUp.isPending &&
                      (levelUp.variables?.itemId ?? levelUp.variables?.templateId) ===
                        (h.itemId ?? h.templateId))
                  }
                  className={cn(
                    "mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition active:scale-[0.99] disabled:opacity-50",
                    atMax
                      ? "border border-border bg-secondary/40 text-muted-foreground"
                      : "gradient-gold text-gold-foreground",
                  )}
                >
                  {levelUp.isPending &&
                  (levelUp.variables?.itemId ?? levelUp.variables?.templateId) ===
                    (h.itemId ?? h.templateId) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="h-4 w-4" />
                  )}
                  {atMax
                    ? `Максимум для ${RARITY_LABEL[h.rarity] ?? h.rarity}`
                    : `Уровень ${h.level + 1} · ${h.nextCost} лайков`}
                </button>
                <div className="mt-1 text-center text-[10px] text-muted-foreground">
                  вложено {Number(h.likesSpent).toLocaleString("ru")} лайков
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Выбор фишки 3★+ для превращения в героя. */
function ConvertBlock({ onDone }: { onDone: () => void }) {
  const inv = useQuery({ queryKey: ["my-chip-inventory"], queryFn: () => myChipInventory() });
  const [selected, setSelected] = useState<{ id: string; level: number; name: string } | null>(
    null,
  );

  // Инвентарь приходит группами (шаблон+уровень) — берём группы от 3★
  // и жертвуем первую свободную фишку группы.
  const eligible = (inv.data ?? [])
    .filter((g) => g.count > 0 && convertRuleForChipLevel(Number(g.level)) !== null)
    .sort((a, b) => b.level - a.level);

  return (
    <div className="rounded-2xl border border-neon/30 bg-neon/5 p-3">
      <div className="mb-2 text-xs font-semibold">Фишки от 3★ — можно превратить в героя</div>
      {inv.isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : eligible.length === 0 ? (
        <div className="py-3 text-center text-[11px] text-muted-foreground">
          Подходящих фишек нет
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {eligible.slice(0, 30).map((g) => {
            const rule = convertRuleForChipLevel(Number(g.level))!;
            const chipId = g.chipIds[0];
            return (
              <button
                key={`${g.templateId}:${g.level}`}
                onClick={() =>
                  chipId &&
                  setSelected({ id: chipId, level: Number(g.level), name: g.templateName })
                }
                disabled={!chipId}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-2 text-left transition hover:border-neon/50 active:scale-95 disabled:opacity-50"
              >
                {g.imageUrl ? (
                  <img
                    src={thumb(g.imageUrl, 72)}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-lg object-cover"
                  />
                ) : null}
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold">
                    {g.templateName} · {g.level}★
                  </span>
                  <span className="block text-[10px]" style={{ color: RARITY_COLOR[rule.rarity] }}>
                    {RARITY_LABEL[rule.rarity]} · {rule.likes} лайков
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    в наличии {g.count}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {selected && (
        <ConvertToHeroModal
          chipId={selected.id}
          chipLevel={selected.level}
          chipName={selected.name}
          onClose={() => setSelected(null)}
          onResultClose={() => {
            setSelected(null);
            onDone();
          }}
        />
      )}
    </div>
  );
}
