// Генератор «Письмо о турнирах» — одно окно на две страницы: /admin/letters и
// /admin/tournaments (кнопка в шапке открывает его поверх страницы).
//
// Слово владельца (04.10.2026): «сгенерировать» → письмо показывается админу
// (сразу предпросмотр — как увидит игрок), админ правит при нужде и жмёт
// «Отправить всем» — письмо уходит всем в игре. Закрыл форму письма — назад к
// выбору турниров (можно перегенерировать с другими галочками); отправил —
// закрывается всё, список писем обновляется сам (useLetterSave).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import type { TourLetterSource } from "@/lib/tourLetter";
import { adminTourLetterSource } from "@/server/api/letters/letters-tour";
import { LetterEditor } from "./LetterEditor";
import { TourLetterPick } from "./TourLetterPick";
import { draftFromGenerated, type LetterDraft } from "./letterDraft";
import { defaultPicked, generateTourLetter } from "./tourLetterDraft";
import { useLetterSave } from "./useLetterSave";

export function TourLetterGen({ onClose }: { onClose: () => void }) {
  const [series, setSeries] = useState("");
  // null — админ галочек не трогал: отмечены все запланированные.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [draft, setDraft] = useState<LetterDraft | null>(null);
  const save = useLetterSave(onClose);

  // Без кэша между открытиями: турнир только что поправили на соседней
  // плашке — письмо должно взять свежие призы и время, а не минутной давности.
  const srcQ = useQuery({
    queryKey: ["admin-tour-letter-source"],
    queryFn: async (): Promise<TourLetterSource> => adminTourLetterSource(),
    staleTime: 0,
    gcTime: 0,
  });
  const rows = srcQ.data?.tours ?? [];
  const sel = picked ?? defaultPicked(rows);

  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  // Пока идёт перечитывание — не собираем: в данных могла быть прежняя цена.
  const generate = () => {
    if (srcQ.data && !srcQ.isFetching)
      setDraft(draftFromGenerated(generateTourLetter(srcQ.data, sel, series)));
  };

  if (draft)
    return (
      <LetterEditor
        value={draft}
        onChange={setDraft}
        onSave={() => save.mutate(draft)}
        saving={save.isPending}
        onClose={() => setDraft(null)}
        previewOnOpen
      />
    );

  return (
    <TourLetterPick
      rows={rows}
      loading={srcQ.isFetching}
      error={srcQ.error}
      series={series}
      onSeries={setSeries}
      picked={sel}
      onToggle={toggle}
      onGenerate={generate}
      onClose={onClose}
    />
  );
}

/** Кнопка в шапке страницы: на телефоне коротко, на ПК — целиком. */
export function TourLetterButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-2 text-xs font-medium"
    >
      <Megaphone className="h-4 w-4" />
      <span className="sm:hidden">Анонс</span>
      <span className="hidden sm:inline">Письмо о турнирах</span>
    </button>
  );
}
