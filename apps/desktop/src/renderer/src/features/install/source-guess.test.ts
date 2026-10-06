import { describe, expect, it } from "vitest";
import { commandSource, guessSource, hostOf } from "./source-guess";

describe("guessSource", () => {
  it("reads what typed text points at, through a pasted skills command too", () => {
    expect(guessSource("owner/repo")).toBe("repository");
    expect(guessSource("https://github.com/owner/repo/tree/main/skills/pdf")).toBe("repository");
    expect(guessSource("https://example.com/pdf.tar.gz?download=1")).toBe("archive");
    expect(guessSource("https://example.com/skills/pdf/SKILL.md")).toBe("file");
    expect(guessSource("https://example.com")).toBe("site");
    expect(guessSource("https://example.com/me/skills.git")).toBe("repository");
    expect(guessSource("npx skills add https://example.com/pdf.zip -a codex")).toBe("archive");
  });

  it("finds the source and host of a pasted command", () => {
    expect(commandSource("npx -y skills add 'owner/repo' --skill pdf")).toBe("owner/repo");
    expect(commandSource("owner/repo")).toBeNull();
    expect(hostOf("bunx skills i https://example.com/pdf.zip")).toBe("example.com");
  });
});
