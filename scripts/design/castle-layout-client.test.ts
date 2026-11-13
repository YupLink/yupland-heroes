import assert from "node:assert/strict";
import { test } from "node:test";
import {
  draftKey, loadAccountLayout, localCandidate, saveAccountLayout,
  type LayoutStorage, type LayoutTransport,
} from "../../src/components/castle-live/castleLayoutClient";

const storage = (): LayoutStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
  };
};

test("loading never uploads the legacy phone layout or replaces the remote scene", async () => {
  const s = storage();
  s.setItem("castle-modular-layout-v1", JSON.stringify([{ id: "hall", x: 78 }]));
  let saves = 0;
  const api: LayoutTransport<{ id: string; x: number }> = {
    load: async () => ({ revision: 0, layout: null }),
    save: async () => { saves++; throw new Error("save must not run"); },
  };
  const result = await loadAccountLayout(api, s, "telegram:123");
  assert.equal(result.remote.layout, null);
  assert.equal(result.candidate?.source, "legacy");
  assert.equal(result.candidate?.layout[0].x, 78);
  assert.equal(saves, 0);
  assert.ok(s.getItem("castle-modular-layout-v1"));
});

test("a conflict keeps the local draft and the newer server revision", async () => {
  const s = storage();
  const api: LayoutTransport<{ id: string }> = {
    load: async () => ({ revision: 3, layout: [{ id: "newer" }] }),
    save: async () => ({ ok: false, conflict: true, revision: 4, layout: [{ id: "newer" }] }),
  };
  const result = await saveAccountLayout(api, s, "telegram:123", 3, [{ id: "phone" }]);
  assert.equal(result.ok, false);
  assert.deepEqual(localCandidate(s, "telegram:123")?.layout, [{ id: "phone" }]);
  assert.equal(result.revision, 4);
});

test("success clears only this account's draft and preserves the old shared key", async () => {
  const s = storage();
  s.setItem("castle-modular-layout-v1", "[]");
  s.setItem(draftKey("telegram:other"), '[{"id":"other"}]');
  const api: LayoutTransport<{ id: string }> = {
    load: async () => ({ revision: 0, layout: null }),
    save: async ({ revision }) => ({ ok: true, revision: revision + 1 }),
  };
  await saveAccountLayout(api, s, "telegram:123", 0, [{ id: "hall" }]);
  assert.equal(s.getItem(draftKey("telegram:123")), null);
  assert.ok(s.getItem(draftKey("telegram:other")));
  assert.equal(s.getItem("castle-modular-layout-v1"), "[]");
});

test("network failure retains the account draft", async () => {
  const s = storage();
  const api: LayoutTransport<{ id: string }> = {
    load: async () => ({ revision: 1, layout: [] }),
    save: async () => { throw new Error("offline"); },
  };
  await assert.rejects(saveAccountLayout(api, s, "telegram:123", 1, [{ id: "hall" }]));
  assert.deepEqual(localCandidate(s, "telegram:123")?.layout, [{ id: "hall" }]);
});

test("saving before account load is forbidden", async () => {
  const s = storage();
  const api: LayoutTransport<never> = {
    load: async () => ({ revision: 0, layout: null }),
    save: async () => { throw new Error("must not be called"); },
  };
  await assert.rejects(saveAccountLayout(api, s, "", 0, []));
});

test("two devices read the same account scene and a stale save cannot replace it", async () => {
  const phone = storage(), computer = storage();
  let server = { revision: 0, layout: null as { id: string; x: number }[] | null };
  const api: LayoutTransport<{ id: string; x: number }> = {
    load: async () => structuredClone(server),
    save: async ({ revision, layout }) => {
      if (revision !== server.revision) return { ok: false, conflict: true, ...structuredClone(server) };
      server = { revision: revision + 1, layout: structuredClone(layout) };
      return { ok: true, revision: server.revision };
    },
  };
  const phoneLoaded = await loadAccountLayout(api, phone, "telegram:123");
  const computerLoaded = await loadAccountLayout(api, computer, "telegram:123");
  assert.equal(phoneLoaded.remote.revision, 0);
  assert.equal(computerLoaded.remote.revision, 0);
  assert.equal((await saveAccountLayout(api, phone, "telegram:123", 0, [{ id: "hall", x: 78 }])).ok, true);
  const onComputer = await loadAccountLayout(api, computer, "telegram:123");
  assert.deepEqual(onComputer.remote.layout, [{ id: "hall", x: 78 }]);
  const stale = await saveAccountLayout(api, computer, "telegram:123", 0, [{ id: "hall", x: 10 }]);
  assert.equal(stale.ok, false);
  assert.deepEqual(server.layout, [{ id: "hall", x: 78 }]);
  assert.deepEqual(localCandidate(computer, "telegram:123")?.layout, [{ id: "hall", x: 10 }]);
});
