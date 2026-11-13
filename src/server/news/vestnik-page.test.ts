import { describe, expect, it } from "vitest";
import { vestnikPageHtml } from "./vestnik-page";

describe("страница «Вестника»", () => {
  const html = vestnikPageHtml();

  it("всё на одной странице: сегодня/неделя, копирование; кнопки публикации нет (09.11)", () => {
    expect(html).toContain('data-m="day">Сегодня');
    expect(html).toContain('data-m="week">Неделя');
    expect(html).not.toContain('id="publish"');
    expect(html).not.toContain("Опубликовать в канал");
    expect(html).toContain('id="copy"');
    expect(html).toContain('id="regen">Сгенерировать заново');
    expect(html).toContain('id="api">Данные API');
    expect(html).toContain('id="copydata">Скопировать данные');
    expect(html).toContain('id="copylink">Скопировать ссылку API');
    expect(html).toContain("Скачать");
  });

  it("не индексируется, ссылка не утекает через Referer, разметка без innerHTML", () => {
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect(html).toContain('name="referrer" content="no-referrer"');
    expect(html).not.toContain("innerHTML");
  });

  it("ключ берёт из своего адреса и шлёт его же в /api/news", () => {
    expect(html).toContain('new URLSearchParams(location.search).get("key")');
    expect(html).toContain('"/api/news?key=" + encodeURIComponent(KEY)');
    // Публикации со страницы нет (09.11) — запроса на отправку в канал тоже.
    expect(html).not.toContain('{ method: "POST" }');
    expect(html).toContain('"&v=" + v + "&t=" + Date.now()');
    expect(html).toContain('api("format=json&days=" + days())');
  });
});
