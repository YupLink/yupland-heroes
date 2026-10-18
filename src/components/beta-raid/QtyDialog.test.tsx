// Окно «сколько» — выброс из рюкзака и склад: что видит игрок при открытии.
// Главное: дробь меньше тысячной не превращается ни в «1», ни в «0».
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { Warehouse } from "lucide-react";

vi.mock("react-dom", () => ({ createPortal: (node: ReactNode) => node }));
// Окно открывается Radix-диалогом (#25): его портал без браузера ничего не
// выводит — кладём содержимое на месте, как и обычный портал выше.
vi.mock("@radix-ui/react-dialog", async (importOriginal) => {
  const real = await importOriginal<typeof import("@radix-ui/react-dialog")>();
  return { ...real, Portal: ({ children }: { children?: ReactNode }) => <>{children}</> };
});
// Настоящий словарь и подстановка, язык — русский.
vi.mock("@/lib/i18n", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...real,
    useT: () => (key: string, p?: Record<string, string | number>) => real.tFor("ru", key, p),
    useLang: () => "ru",
  };
});

// Окно уходит порталом в document.body; в node его нет — хватит заглушки.
vi.stubGlobal("document", { body: {} });

const { BackpackDiscardModal } = await import("./BackpackDiscardModal");
const { QtyDialog } = await import("./QtyDialog");
const { dict } = await import("@/lib/translations");

const discard = (total: number, durability?: number | null) =>
  renderToStaticMarkup(
    <BackpackDiscardModal
      name="Газировка Товарища"
      image={null}
      total={total}
      durability={durability}
      busy={false}
      onDiscard={() => {}}
      onClose={() => {}}
    />,
  );

describe("окно выброса", () => {
  it("0,000178 шт.: окно предлагает ровно остаток, а не «1»", () => {
    const html = discard(0.000178);
    expect(html).toContain('value="0,000178"');
    expect(html).not.toContain('value="1"');
    expect(html).toContain("В рюкзаке: 0,000178");
    expect(html).toContain("Ячейку (0,000178)");
    expect(html).toContain("Всё (0,000178)");
    expect(html).toContain("Выбросим 0,000178 шт. в мешочек на клетке — освободится ячеек: 1.");
  });

  it("25 шт.: начинаем с неполной ячейки, «Всё» — весь вид", () => {
    const html = discard(25);
    expect(html).toContain('value="5"');
    expect(html).toContain("Ячейку (5)");
    expect(html).toContain("Всё (25)");
    expect(html).toContain("Выбросим 5 шт. в мешочек на клетке — освободится ячеек: 1.");
  });

  it("изношенный инструмент: строка об уничтожении — только когда уходит всё", () => {
    // Одна штука — «Ячейку» и «Всё» совпадают: уходит вся стопка.
    expect(discard(1, 40)).toContain("Изношенная штука (40%) будет уничтожена");
    // Три штуки — начинаем с «Ячейки» (3 = всё): тоже строка.
    expect(discard(3, 40)).toContain("Изношенная штука (40%) будет уничтожена");
    // 25 штук — начинаем с 5: изношенная остаётся, строки нет.
    expect(discard(25, 40)).not.toContain("Изношенная штука");
    // Целый инструмент и не инструмент — строки нет.
    expect(discard(3, 100)).not.toContain("Изношенная штука");
    expect(discard(3, null)).not.toContain("Изношенная штука");
  });

  it("поле текстовое с цифровой клавиатурой: андроид пишет запятую", () => {
    expect(discard(3)).toMatch(/<input type="text" inputMode="decimal"/);
  });
});

describe("окно склада", () => {
  const html = (haveKey: string, label: string) =>
    renderToStaticMarkup(
      <QtyDialog
        name="Яблоко"
        image={null}
        haveKey={haveKey}
        total={25}
        cell={20}
        icon={Warehouse}
        label={label}
        tone="gold"
        busy={false}
        onSubmit={() => {}}
        onClose={() => {}}
      />,
    );

  it("«Положить»: плитка, вид целиком и выбор до нажатия", () => {
    const out = html("braid.backpack_have", "Положить");
    expect(out).toContain('value="20"');
    expect(out).toContain("В рюкзаке: 25");
    expect(out).toContain("Ячейку (20)");
    expect(out).toContain("Всё (25)");
    expect(out).toMatch(/<button[^>]*>[^]*Положить<\/button>/);
    expect(out).not.toContain("Выбросим");
  });

  it("«Забрать»: сколько на складе", () => {
    expect(html("braid.wh_have", "Забрать")).toContain("На складе: 25");
  });

  it("ru и en заведены для всех ключей окна", () => {
    for (const k of [
      "braid.backpack_have",
      "braid.backpack_one_cell",
      "braid.backpack_all",
      "braid.backpack_discard_note",
      "braid.backpack_discard_worn",
      "braid.wh_have",
      "braid.wh_put",
      "braid.wh_take",
    ]) {
      expect(dict[k]?.ru).toBeTruthy();
      expect(dict[k]?.en).toBeTruthy();
    }
  });
});
