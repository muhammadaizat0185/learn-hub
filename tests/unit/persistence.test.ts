import { beforeEach, describe, expect, it, vi } from "vitest";

let persistence: typeof import("../../src/lib/persistence");
const KEY = "hub.v1.course.persistence.progress";
const OTHER = "hub.v1.course.other.progress";

beforeEach(async () => {
  localStorage.clear();
  // The fallback is tab-local module state, not localStorage; start each case with a fresh tab.
  vi.resetModules();
  persistence = await import("../../src/lib/persistence");
});

describe("durable writes and volatile fallback", () => {
  it("reads, writes and removes durable values without an error event", () => {
    const notify = vi.spyOn(window, "dispatchEvent");
    expect(persistence.readStored(KEY)).toBeNull();
    expect(persistence.writeStored(KEY, "saved")).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("saved");
    expect(persistence.readStored(KEY)).toBe("saved");
    expect(persistence.writeStored(KEY, null)).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(persistence.readStored(KEY)).toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  it("returns null rather than throwing when an uncached read is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(persistence.readStored(KEY)).toBeNull();
  });

  it("reports a failed write, keeps the new value usable in this tab and leaves other keys alone", () => {
    localStorage.setItem(KEY, "old durable value");
    localStorage.setItem(OTHER, "other course");
    const notify = vi.spyOn(window, "dispatchEvent");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(persistence.writeStored(KEY, "unsaved value")).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("old durable value");
    expect(persistence.readStored(KEY)).toBe("unsaved value");
    expect(persistence.readStored(OTHER)).toBe("other course");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0].type).toBe("hub-storage-error");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(persistence.readStored(KEY)).toBe("unsaved value");
  });

  it("uses a null tombstone when removal fails instead of exposing a stale session", () => {
    localStorage.setItem(KEY, "stale session");
    const notify = vi.spyOn(window, "dispatchEvent");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(persistence.writeStored(KEY, null)).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("stale session");
    expect(persistence.readStored(KEY)).toBeNull();
    expect(notify.mock.calls.map(([event]) => event.type)).toEqual(["hub-storage-error"]);
  });

  it.each(["retry saved", null])("clears the volatile override after a successful retry (%j)", (value) => {
    const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(persistence.writeStored(KEY, "unsaved value")).toBe(false);
    failure.mockRestore();
    expect(persistence.writeStored(KEY, value)).toBe(true);
    expect(persistence.readStored(KEY)).toBe(value);
    localStorage.setItem(KEY, "later durable value");
    expect(persistence.readStored(KEY)).toBe("later durable value");
  });

  it("does not pretend that volatile writes survive a fresh module/tab", async () => {
    const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(persistence.writeStored(KEY, "tab-only value")).toBe(false);
    failure.mockRestore();
    vi.resetModules();
    const freshTab = await import("../../src/lib/persistence");
    expect(freshTab.readStored(KEY)).toBeNull();
    expect(persistence.readStored(KEY)).toBe("tab-only value");
  });
});

describe("multi-key transactions", () => {
  it("replaces and removes requested keys without clearing unrelated values", () => {
    localStorage.setItem(KEY, "before");
    localStorage.setItem("session", "active");
    localStorage.setItem(OTHER, "untouched");
    const notify = vi.spyOn(window, "dispatchEvent");
    expect(persistence.writeTransaction([[KEY, "after"], ["new-result", "result"], ["session", null]])).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("after");
    expect(localStorage.getItem("new-result")).toBe("result");
    expect(localStorage.getItem("session")).toBeNull();
    expect(localStorage.getItem(OTHER)).toBe("untouched");
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(["setItem", "removeItem"] as const)("rolls back created, replaced and removed keys after a %s failure", (method) => {
    localStorage.setItem(KEY, "old progress");
    localStorage.setItem("session", "old session");
    localStorage.setItem("result", "old result");
    localStorage.setItem(OTHER, "untouched");
    const realSet = Storage.prototype.setItem;
    const realRemove = Storage.prototype.removeItem;
    let failed = false;
    vi.spyOn(Storage.prototype, method).mockImplementation(function (this: Storage, key: string, value?: string) {
      if (!failed && key === (method === "setItem" ? "result" : "session")) {
        failed = true;
        throw new Error("storage failure");
      }
      if (method === "setItem") return realSet.call(this, key, value!);
      return realRemove.call(this, key);
    });
    const notify = vi.spyOn(window, "dispatchEvent");
    expect(persistence.writeTransaction([[KEY, "new progress"], ["created", "new"], ["session", null], ["result", "new result"]])).toBe(false);
    expect(failed).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("old progress");
    expect(localStorage.getItem("created")).toBeNull();
    expect(localStorage.getItem("session")).toBe("old session");
    expect(localStorage.getItem("result")).toBe("old result");
    expect(localStorage.getItem(OTHER)).toBe("untouched");
    expect(notify.mock.calls.map(([event]) => event.type)).toEqual(["hub-storage-error"]);
  });

  it("does not write any entries if the initial snapshot cannot be read", () => {
    localStorage.setItem(KEY, "old");
    const readFailure = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    expect(persistence.writeTransaction([[KEY, "new"], ["session", null]])).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    readFailure.mockRestore();
    expect(localStorage.getItem(KEY)).toBe("old");
  });

  it("discards volatile overrides only for keys in a successful transaction", () => {
    const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    persistence.writeStored(KEY, "unsaved progress");
    persistence.writeStored("session", "unsaved session");
    persistence.writeStored(OTHER, "other unsaved progress");
    failure.mockRestore();
    expect(persistence.writeTransaction([[KEY, "restored progress"], ["session", null]])).toBe(true);
    expect(persistence.readStored(KEY)).toBe("restored progress");
    expect(persistence.readStored("session")).toBeNull();
    expect(persistence.readStored(OTHER)).toBe("other unsaved progress");
  });

  it("preserves existing volatile values after a failed transaction, not the attempted restore", () => {
    localStorage.setItem(KEY, "durable progress");
    const failure = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    persistence.writeStored(KEY, "unsaved progress");
    failure.mockRestore();
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("restore failed"); });
    expect(persistence.writeTransaction([[KEY, "restored progress"]])).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("durable progress");
    expect(persistence.readStored(KEY)).toBe("unsaved progress");
  });

  it("frees replacement space before restoring originals after a real quota limit", () => {
    localStorage.setItem(KEY, "a".repeat(100));
    localStorage.setItem("labs", "b".repeat(60));
    localStorage.setItem("drafts", "c".repeat(10));
    localStorage.setItem(OTHER, "other");
    const before = { ...localStorage };
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      const used = Object.keys(this).filter((storedKey) => storedKey !== key).reduce((sum, storedKey) => sum + this.getItem(storedKey)!.length, 0);
      if (used + value.length > 200) throw new DOMException("Quota exceeded", "QuotaExceededError");
      realSet.call(this, key, value);
    });
    expect(persistence.writeTransaction([[KEY, "a".repeat(10)], ["labs", "b".repeat(130)], ["drafts", "c".repeat(100)]])).toBe(false);
    expect({ ...localStorage }).toEqual(before);
    expect(persistence.readStored(KEY)).toBe("a".repeat(100));
  });

  it("returns failure and retains originals in this tab if a continuing outage prevents rollback", () => {
    localStorage.setItem(KEY, "before");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("offline"); });
    const notify = vi.spyOn(window, "dispatchEvent");
    expect(persistence.writeTransaction([[KEY, "after"]])).toBe(false);
    expect(persistence.readStored(KEY)).toBe("before");
    expect(notify.mock.calls.map(([event]) => event.type)).toEqual(["hub-storage-error"]);
  });
});
