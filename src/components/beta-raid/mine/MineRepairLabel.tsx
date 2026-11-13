// Подпись кнопки починки шахты v2: «Починить за [золото] 20 и забрать».
//
// Цена — значками ресурсов, как в полосе ресурсов: «20 золото» в тексте
// читалось бы с ошибкой падежа, а значок с числом понятен на обоих языках.
// {cost} в строке словаря — место, куда встают значки.
import { useLang, useT } from "@/lib/i18n";
import { marketResourceIconSrc } from "@/lib/resourceIcons";
import type { MineV2Resource } from "@/lib/mineV2";

const MARK = "\u0001";

export function MineRepairLabel({
  textKey,
  cost,
}: {
  textKey: string;
  cost: Partial<Record<MineV2Resource, number>>;
}) {
  const t = useT();
  const locale = useLang() === "en" ? "en-US" : "ru-RU";
  const [pre = "", post = ""] = t(textKey, { cost: MARK }).split(MARK);
  const rows = Object.entries(cost).filter(([, n]) => (n ?? 0) > 0);
  return (
    <>
      {pre.trim() && <span>{pre.trim()}</span>}
      {rows.map(([res, n]) => {
        const icon = marketResourceIconSrc(res);
        const name = t(`mine.res.${res}`);
        return (
          <span key={res} className="inline-flex items-center gap-0.5 tabular-nums">
            {/* Подложка: золотой значок иначе тонет в золотой кнопке. */}
            {icon && (
              <img
                src={icon}
                alt={name}
                className="h-4 w-4 rounded-full bg-black/30 p-px"
                decoding="async"
              />
            )}
            {Number(n).toLocaleString(locale)}
            {!icon && ` ${name}`}
          </span>
        );
      })}
      {post.trim() && <span>{post.trim()}</span>}
    </>
  );
}
