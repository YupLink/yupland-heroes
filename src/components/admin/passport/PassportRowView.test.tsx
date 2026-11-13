// Строка паспорта: все колонки на месте, пустое — прочерком, кошелёк без подписи
// помечен, второй аккаунт того же Telegram виден сразу.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { dict } from "@/lib/translations/passport";

// Переключатель белого списка вывода — своё окно с запросами; строке он не нужен.
vi.mock("./PassportWithdraw", () => ({ PassportWithdraw: () => null }));

vi.mock("@/lib/i18n", () => ({
  useLang: () => "ru",
  useT: () => (key: string, p?: Record<string, unknown>) =>
    (dict[key]?.ru ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(p?.[k] ?? "")),
}));

const { PassportRowView } = await import("./PassportRowView");
const base = {
  id: "acc_main",
  lastSeenAt: "2026-11-06T10:00:00Z",
  tg: "700000001",
  username: "owner_tg",
  wallets: [{ wallet: "owner.tg", signed: false, off: false }],
  google: null,
  noTg: null,
  twins: [],
  archivedInto: null,
  withdraw: true,
};

describe("строка паспорта", () => {
  it("Telegram, кошелёк без подписи, Google прочерком", () => {
    const html = renderToStaticMarkup(<PassportRowView row={base} />);
    expect(html).toContain("acc_main");
    expect(html).toContain("@owner_tg");
    expect(html).toContain("owner.tg");
    expect(html).toContain("(без подписи)");
    expect(html).toContain("—");
    expect(html).not.toContain("На этом Telegram");
    expect(html).toContain("был в игре 06.11.26");
  });

  it("второй аккаунт на том же Telegram — счётчик, без внутренних номеров", () => {
    const row = { ...base, twins: ["acc_twin"] };
    const html = renderToStaticMarkup(<PassportRowView row={row} />);
    expect(html).toContain("На этом Telegram аккаунтов: 2");
    expect(html).not.toContain("acc_twin");
    const grouped = renderToStaticMarkup(<PassportRowView row={row} inGroup />);
    expect(grouped).not.toContain("На этом Telegram");
  });

  it("не заходил с начала учёта — так и сказано", () => {
    const html = renderToStaticMarkup(<PassportRowView row={{ ...base, lastSeenAt: null }} />);
    expect(html).toContain("не заходил с 15.10");
  });

  it("без Telegram — как вошёл; почта Google и отвязанный кошелёк", () => {
    const html = renderToStaticMarkup(
      <PassportRowView
        row={{
          ...base,
          tg: null,
          username: null,
          noTg: "google",
          google: "a@gmail.com",
          wallets: [{ wallet: "x.near", signed: true, off: true }],
        }}
      />,
    );
    expect(html).toContain("вход через Google");
    expect(html).toContain("a@gmail.com");
    expect(html).toContain("(отвязан)");
    expect(html).not.toContain("(без подписи)");
  });

  it("аккаунт в архиве — видно, куда ушли ключи", () => {
    const html = renderToStaticMarkup(
      <PassportRowView row={{ ...base, tg: null, wallets: [], archivedInto: "acc_main2" }} />,
    );
    expect(html).toContain("в архиве, основной acc_main2");
  });
});
