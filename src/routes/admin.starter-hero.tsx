// /admin/starter-hero — раздача common-героя активным без героя.
//
// Отдельная страница, а не пункт меню в hallway/likes: раздача — одноразовая
// служебная операция, и кнопка её должна жить в изолированном месте, чтобы
// не оказаться нажатой случайно из соседней рабочей вкладки.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, UserPlus2 } from "lucide-react";
import { toast } from "sonner";
import {
  adminGrantCommonToDormant,
  adminGrantCommonToSelf,
} from "@/server/api/heroes-common-grant";
import { humanError } from "@/lib/humanError";

export const Route = createFileRoute("/admin/starter-hero")({
  component: StarterHeroPage,
});

type Result = {
  templateId: string;
  candidates: number;
  delivered: number;
  skippedExisting: number;
};

function StarterHeroPage() {
  const [last, setLast] = useState<Result | null>(null);
  const grant = useMutation({
    mutationFn: () => adminGrantCommonToDormant(),
    onSuccess: (r) => {
      setLast(r);
      if (r.delivered > 0) toast.success(`Разослано подарков: ${r.delivered}`);
      else toast(`Разослано: 0 (все уже с героем или уже получили)`);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const grantSelf = useMutation({
    mutationFn: () => adminGrantCommonToSelf(),
    onSuccess: (r) => {
      if (r.delivered) toast.success("Подарок себе отправлен — забери в кружке над картой");
      else toast("Подарок уже лежал (не задваиваем)");
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="mx-auto max-w-2xl p-4">
      <header className="mb-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Админ · старт
        </div>
        <h1 className="font-display text-2xl font-bold">Обычный герой</h1>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-[13px] leading-relaxed">
          Раздать <b>common-героя</b> всем, у кого сейчас нет ни живого, ни
          спящего героя <b>и</b> кто был активен за последние 48 часов.
        </p>
        <ul className="mt-3 space-y-1 text-[12px] text-muted-foreground">
          <li>• Макс. уровень: 10</li>
          <li>• 1 заклинание, 1 ячейка рюкзака</li>
          <li>• Артефакты: голова, тело, правая рука, ноги</li>
          <li>• Из фишек не создаётся (уровень &lt; 3★)</li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => grant.mutate()}
            disabled={grant.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-[13px] font-bold text-background transition enabled:hover:bg-gold/80 disabled:opacity-40"
          >
            {grant.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus2 className="h-4 w-4" />
            )}
            Раздать общего героя активным
          </button>
          <button
            type="button"
            onClick={() => grantSelf.mutate()}
            disabled={grantSelf.isPending}
            className="inline-flex items-center gap-2 rounded-xl border border-gold/60 bg-gold/10 px-3 py-2 text-[13px] font-bold text-gold transition enabled:hover:bg-gold/20 disabled:opacity-40"
          >
            {grantSelf.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus2 className="h-4 w-4" />
            )}
            Дать себе (посмотреть)
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Идемпотентно: повторный клик подарок не задваивает. «Дать себе»
          обходит фильтр «нет героя» — приходит подарок даже если у тебя
          уже есть герой.
        </p>
      </section>

      {last && (
        <section className="mt-4 rounded-2xl border border-border bg-secondary/30 p-4 text-[12px]">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Результат
          </div>
          <ul className="space-y-1">
            <li>
              Кандидатов найдено: <b className="tabular-nums">{last.candidates}</b>
            </li>
            <li>
              Подарков разослано: <b className="tabular-nums text-emerald-300">{last.delivered}</b>
            </li>
            <li>
              Уже получали (пропущено): <b className="tabular-nums">{last.skippedExisting}</b>
            </li>
            <li className="pt-2 text-muted-foreground">
              Шаблон: <code>{last.templateId}</code>
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}
