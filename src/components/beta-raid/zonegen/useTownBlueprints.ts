// Шаблоны города: список готовых и своих, сохранение и удаление.
//
// Владелец, 24.09.2026: «надо составлять шаблоны городов — примерные
// расположения, что должно быть в этом городе и какие их виды есть: город-
// подземелье, город адский. Наборы я уже сделал, их бы в шаблоны, а потом
// просто расположение менять».
//
// Шаблон — это ЗАСТЫВШИЙ блок поселения: планировка, размер, плотность,
// дорога, «достроенность» и состав построек. Сид и количество поселений в него не
// входят: они про «где и сколько», а шаблон про «что это за город».
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BlueprintBody, TownBlueprint } from "@/lib/raid/zonegen/blueprint-types";
import {
  adminDeleteTownBlueprint,
  adminSaveTownBlueprint,
  adminTownBlueprints,
} from "@/server/api/beta-raid/zonegen/blueprints-api";

/**
 * Тело шаблона из чего угодно, где эти поля есть: из рецепта — чтобы
 * сохранить, из самого шаблона — чтобы перенести в рецепт без его id, имени и
 * пометки (в рецепте поселения им делать нечего).
 */
export function blueprintBody(s: BlueprintBody): BlueprintBody {
  return {
    layout: s.layout,
    size: s.size,
    density: s.density,
    roadId: s.roadId,
    built: s.built,
    slots: s.slots,
    // Автоподбор едет вместе с шаблоном: «Живой городок» — это масштаб и
    // тема, а не застывший состав (владелец, 25.09: «рандомно делай подборки»).
    auto: s.auto,
    buildings: s.buildings,
    kind: s.kind,
    theme: s.theme,
  };
}

/**
 * Список шаблонов: предустановленные и свои — одним ответом сервера. Минуту
 * считаем свежим: шаблоны правят раз в неделю, а панель открывают десятки раз
 * за сессию.
 *
 * Готовые шаблоны считает СЕРВЕР (из живого справочника построек) — клиент их
 * не пересчитывает: два источника одного списка расходятся на первой же новой
 * постройке.
 */
export function useTownBlueprints(enabled = true) {
  const qc = useQueryClient();
  const list = useQuery<TownBlueprint[]>({
    queryKey: ["zonegen-blueprints"],
    queryFn: async () => (await adminTownBlueprints()).list,
    staleTime: 60_000,
    enabled,
  });

  // После записи и удаления список перечитываем: свой шаблон должен появиться
  // в селекте сразу, без перезагрузки страницы.
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["zonegen-blueprints"] });
  };

  const save = useMutation({
    mutationFn: (v: { name: string; settlement: BlueprintBody }) =>
      adminSaveTownBlueprint({ data: v }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteTownBlueprint({ data: { id } }),
    onSuccess: invalidate,
  });

  return { list, save, remove };
}
