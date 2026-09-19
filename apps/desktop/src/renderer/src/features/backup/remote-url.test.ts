import { describe, expect, it } from "vitest";
import { isGithubRemote, remoteWebUrl } from "./remote-url";

describe("remote urls", () => {
  it("recognises GitHub over https and ssh", () => {
    expect(isGithubRemote("https://github.com/me/backup.git")).toBe(true);
    expect(isGithubRemote("git@github.com:me/backup.git")).toBe(true);
    expect(isGithubRemote("ssh://git@github.com/me/backup.git")).toBe(true);
    expect(isGithubRemote("https://git.example.com/me/backup.git")).toBe(false);
    expect(isGithubRemote(null)).toBe(false);
  });

  it("builds the repository web page", () => {
    expect(remoteWebUrl("https://github.com/me/backup.git")).toBe("https://github.com/me/backup");
    expect(remoteWebUrl("git@github.com:me/backup.git")).toBe("https://github.com/me/backup");
    expect(remoteWebUrl("not a url")).toBeNull();
  });
});
