// Вкладка «Новости»: газета «Вестник героев» картинкой (24 ч — выпуск дня,
// шире — сводка 7 дней; превью без промокода), текст для поста и ссылка на API с ключом.
// В канал ничего не отправляется (владелец, 09.11.2026) — кнопки отправки нет.
import { useQuery } from "@tanstack/react-query";
import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import type { EconRange } from "@/lib/econ/types";
import { daysOfRange } from "@/lib/news/types";
import { adminNewsDigest } from "@/server/api/news/news-admin";
import { EconError, EconSpinner } from "./EconShared";

const BTN = "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold";

export function EconNewsTab({ range }: { range: EconRange }) {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const days = daysOfRange(range.from, range.to);
  const kind = days === 1 ? "day" : "week";

  const q = useQuery({
    queryKey: ["admin-econ", "news", days, lang],
    queryFn: () => adminNewsDigest({ data: { days, lang } }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  if (q.isLoading) return <EconSpinner />;
  if (q.error || !q.data) return <EconError error={q.error} />;

  const copy = (value: string, done: string) =>
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success(done))
      .catch(() => toast.error(t("econ.news.copy_failed")));
  const { apiPath, text, key } = q.data;
  const base = `/api/news?key=${encodeURIComponent(key)}&lang=${lang}&image=${kind}`;
  const pages = kind === "day" ? [base] : [base, `${base}&page=2`];

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copy(text, t("econ.news.copied"))}
          className={`${BTN} border-border text-muted-foreground`}
        >
          <Copy className="h-3.5 w-3.5" />
          {t("econ.news.copy")}
        </button>
        <button
          type="button"
          // Адрес сайта — в момент нажатия: при отрисовке на сервере window нет.
          onClick={() => copy(`${window.location.origin}${apiPath}`, t("econ.news.api_copied"))}
          className={`${BTN} border-border text-muted-foreground`}
        >
          <Link2 className="h-3.5 w-3.5" />
          {t("econ.news.api")}
        </button>
      </div>
      {pages.map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          className="w-full rounded-xl border border-border"
        />
      ))}
      <div className="whitespace-pre-wrap rounded-xl border border-border bg-background/40 p-3 text-[13px] leading-relaxed">
        {text}
      </div>
    </div>
  );
}
