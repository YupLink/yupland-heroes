// Кнопка «Надеть лучшее»: одним нажатием разложить по местам ту одежду, что
// даёт герою максимум статов.
//
// Зачем: владелец — «кнопка, которая бы надевала на героя лучшую одежду,
// повышающую максимально статы; должна показывать зелёной стрелочкой вверх,
// если есть что-то, что улучшит характеристики; в противном случае просто
// сообщение — уже надеты лучшие артефакты».
//
// Что здесь НЕ считается: сколько именно прибавится и что во что положить.
// Прибавку (bestGain) и саму раскладку считает сервер — той же функцией, что
// кормит бой. Посчитай клиент сам, кнопка обещала бы «+7», а герой получал бы
// «+5»: у клиента нет ни расы, ни таблицы бонусов.
//
// Компонент самодостаточный (своя мутация и свой инвалидатор), потому что его
// вставляют в ДВА места — вкладку замка и окно героя с карты. Живи мутация
// снаружи, у каждого окна была бы своя копия правила «что перечитать после
// переодевания», а это ровно тот случай «надел — плашка прежняя», который
// владелец ловил трижды.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUp, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateHeroQueries } from "@/lib/query";
import { equipBestGear } from "@/server/api/heroes-gear-best";
import { plural } from "./effectMeta";
import "./best-gear.css";

export function BestGearButton({
  gain,
  disabled = false,
  onDone,
  beforeAction,
}: {
  /** Насколько поднимутся характеристики, если надеть лучшее. 0 — уже лучшее. */
  gain: number;
  disabled?: boolean;
  /** Замку — закрыть открытую панель слота: она показывает уже неверный выбор. */
  onDone?: () => void;
  /** Таверна замка: перед действием сверить, что открытый герой — активный. */
  beforeAction?: () => Promise<void>;
}) {
  const t = useT();
  const lang = useLang();
  const qc = useQueryClient();

  const best = useMutation({
    mutationFn: async () => {
      await beforeAction?.();
      return equipBestGear();
    },
    onSuccess: (res) => {
      // changed = 0 бывает и без ошибки: игрок нажал в двух окнах подряд, и
      // второму нажатию менять уже нечего. Врать «надето N предметов» в этом
      // случае нельзя — говорим то же, что говорит спокойная строка.
      toast.success(
        res.changed > 0
          ? t("braid.gear_best_toast", {
              n: res.changed,
              word: plural(t, lang, "braid.pl_item", res.changed),
            })
          : t("braid.gear_best_none"),
      );
      // my-energy сверх геройских ключей: интеллект героя задаёт потолок и
      // скорость добычи энергии, и без этого верхняя плашка показывала бы
      // старый максимум до следующего маунта (правило «без F5»).
      invalidateHeroQueries(qc, ["my-energy"]);
      onDone?.();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Прибавка приходит дробной (статы предметов — float), а «+0.30000000000004
  // к характеристикам» игроку не читается. Округляем до десятой И решаем по
  // округлённому: обещать «+0» и правда ничего не изменить — хуже, чем молчать.
  const shown = Math.round(gain * 10) / 10;

  // Улучшать нечего — не гасим кнопку, а убираем её совсем и оставляем
  // спокойную строку. Серая кнопка читается как «сломалось», а строка отвечает
  // ровно на вопрос игрока: «а лучше уже нельзя?».
  if (!(shown > 0)) {
    return (
      <div className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <span>{t("braid.gear_best_none")}</span>
      </div>
    );
  }

  return (
    <button
      data-best-gear
      data-game-button="primary"
      onClick={() => best.mutate()}
      disabled={disabled || best.isPending}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition",
        "border-emerald-500/60 bg-emerald-500/10 text-emerald-400",
        "hover:border-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50",
      )}
    >
      {best.isPending ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        /* Зелёная стрелка вверх — дословная просьба владельца: по одному
           взгляду на вкладку видно, что есть что улучшить. */
        <ArrowUp className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>{t("braid.gear_best_equip")}</span>
      <span data-best-gear-gain className="text-[10px] font-normal opacity-80" aria-label={t("braid.gear_best_gain", { n: shown })} title={t("braid.gear_best_gain", { n: shown })}>
        <span data-best-gear-gain-full>{t("braid.gear_best_gain", { n: shown })}</span>
        <span data-best-gear-gain-short aria-hidden="true">+{shown}</span>
      </span>
    </button>
  );
}
