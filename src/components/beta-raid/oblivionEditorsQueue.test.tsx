// Алтарь и храм без своей кнопки «Сохранить»: правка сразу ложится в клетку
// (редактор карт) или очередь выгрузки (режим бога). Неверное «Забвение» (пара
// «уровень + минуты» по правилу 28.09) туда не уходит — остаётся в форме со
// строкой ошибки; верное уходит, соседние ключи конфига целы.
//
// Окружение node, DOM нет: вложенные редакторы подменены заглушками, которые
// отдают свои onChange, — их и дёргаем, как это сделал бы ввод админа.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BoostEffect } from "@/lib/hero/boost";

type Change = (next: unknown[]) => void;
const cap = vi.hoisted(() => ({ effects: null as Change | null, prices: null as Change | null }));

vi.mock("@/lib/i18n", () => ({ useLang: () => "ru", useT: () => (key: string) => key }));
vi.mock("@/server/api/admin-payouts", () => ({ listRewardTokens: async () => [] }));
vi.mock("@/components/beta-raid/market/BoostEffectsEditor", () => ({
  BoostEffectsEditor: (p: { onChange: Change }) => {
    cap.effects = p.onChange;
    return null;
  },
}));
vi.mock("@/components/admin/hex-editor/PortalPricesEditor", () => ({
  PortalPricesEditor: (p: { onChange: Change }) => {
    cap.prices = p.onChange;
    return null;
  },
}));

const { BoostConfigEditor } = await import("@/components/admin/hex-editor/BoostConfigEditor");
const { AdminOblivionEditor } = await import("./AdminOblivionEditor");

const render = (el: ReactElement) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);
const obl = (value: string, minutes: string): BoostEffect => ({ stat: "oblivion", value, minutes });
const gold = [{ resource: "gold", amount: 5 }];

describe("алтарь (BoostConfigEditor): неверное забвение в клетку не уходит", () => {
  it("неверная пара — onChange не зовётся; верная — уходит целиком", () => {
    const onChange = vi.fn();
    const spd: BoostEffect = { stat: "spd", value: "1", minutes: "30" };
    render(
      <BoostConfigEditor config={{ effects: [spd], prices: [] }} tokens={[]} onChange={onChange} />,
    );
    cap.effects?.([spd, obl("0", "")]);
    cap.effects?.([obl("", "30")]);
    expect(onChange).not.toHaveBeenCalled();
    cap.effects?.([spd, obl("0", "30")]);
    expect(onChange).toHaveBeenCalledWith({ effects: [spd, obl("0", "30")], prices: [] });
  });

  it("без забвения всё уходит, как раньше", () => {
    const onChange = vi.fn();
    render(
      <BoostConfigEditor config={{ effects: [], prices: [] }} tokens={[]} onChange={onChange} />,
    );
    cap.prices?.(gold);
    expect(onChange).toHaveBeenCalledWith({ effects: [], prices: gold });
  });
});

describe("храм (AdminOblivionEditor): неверная пара в очередь выгрузки не уходит", () => {
  it("«0» или пусто без времени — правка цены не уходит", () => {
    for (const [level, minutes] of [
      ["0", ""],
      ["", ""],
    ]) {
      const onSave = vi.fn();
      render(
        <AdminOblivionEditor
          config={{ oblivion: { prices: [], level, minutes } }}
          onSave={onSave}
        />,
      );
      cap.prices?.(gold);
      expect(onSave).not.toHaveBeenCalled();
    }
  });

  it("верная пара — уходит, соседние ключи конфига клетки целы", () => {
    const onSave = vi.fn();
    const config = { effect: "oblivion", oblivion: { prices: [], level: "0", minutes: "30" } };
    render(<AdminOblivionEditor config={config} onSave={onSave} />);
    cap.prices?.(gold);
    expect(onSave).toHaveBeenCalledWith({
      effect: "oblivion",
      oblivion: { prices: gold, level: "0", minutes: "30" },
    });
  });
});
