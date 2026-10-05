import { describe, expect, it } from "vitest";
import { shownProgress, withoutFinished, withProgress } from "./background-work";

describe("background work in the status bar", () => {
  it("keeps showing a running task when another one finishes", () => {
    let work = withProgress([], { key: "install", phase: "installing", name: "pdf" });
    work = withProgress(work, { key: "scan", phase: "scanning" });
    work = withProgress(work, { key: "scan", phase: "done" });
    expect(shownProgress(work)).toMatchObject({ key: "install", phase: "installing" });

    // The finished one is forgotten after its moment; the running one stays.
    work = withoutFinished(work, "scan");
    expect(work.map((entry) => entry.key)).toEqual(["install"]);
  });

  it("shows the last done task while nothing else runs, then nothing", () => {
    let work = withProgress([], { key: "install", phase: "done" });
    expect(shownProgress(work)?.phase).toBe("done");
    work = withoutFinished(work, "install");
    expect(shownProgress(work)).toBeNull();
  });

  it("does not forget a task that started again after it finished", () => {
    let work = withProgress([], { key: "update:a", phase: "done" });
    work = withProgress(work, { key: "update:a", phase: "cloning" });
    expect(withoutFinished(work, "update:a")).toBe(work);
  });
});
