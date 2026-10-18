// Кнопка лопаты в окнах мешочка и сундуков (ПРАВИЛА §8.24): «Закопать» /
// «Выкопать» — только лопатой в руках. Лопата есть, но в руках другое (или лопат
// несколько без выбора) — «Взять <Лопата>» одним нажатием, дальше та же кнопка
// уже закапывает. Лопаты нет — «Нужна лопата», неактивна. Лопата одна, а в
// руках пусто — сразу действие: сервер сделает её основной сам.
import { Hand, Loader2, Shovel } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useMainTool } from "@/components/beta-raid/tool/useMainTool";

export function ShovelButton({
  label,
  busy,
  disabled = false,
  onDig,
  className,
}: {
  /** Ключ надписи действия: «bag.bury» / «bag.dig». */
  label: string;
  busy: boolean;
  disabled?: boolean;
  onDig: () => void;
  className: string;
}) {
  const t = useT();
  const tool = useMainTool();
  const pick = tool.pick({ kind: "shovel" });
  const take = !pick.ok && pick.why === "idle" ? pick.key : null;
  const none = !pick.ok && !take;
  return (
    <button
      type="button"
      disabled={busy || disabled || tool.busy || none}
      onClick={() => (take ? tool.take(take) : onDig())}
      className={className}
    >
      {busy || tool.busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : take ? (
        <Hand className="h-4 w-4" />
      ) : (
        <Shovel className="h-4 w-4" />
      )}
      {take ? t("tool.take", { tool: tool.nameOf(take) }) : none ? t("bag.need_shovel") : t(label)}
    </button>
  );
}
