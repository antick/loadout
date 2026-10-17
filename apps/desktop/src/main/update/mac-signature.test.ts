import { expect, it, vi } from "vitest";
import { verifyMacPublisher } from "./mac-signature";

const INSTALLED = "/Applications/Loadout.app";
const STAGED = "/tmp/update/Loadout.app";
const ID = "sh.potion.loadout";
const TEAM = "ABC1234567";
const response = { stdout: "", stderr: `TeamIdentifier=${TEAM}\n` };

it("requires Developer ID, the installed team, the app identity and Apple's assessment", async () => {
  const run = vi.fn().mockResolvedValue(response);
  await verifyMacPublisher(STAGED, INSTALLED, ID, run);
  expect(run).toHaveBeenNthCalledWith(1, "codesign", ["--verify", "--deep", "--strict", INSTALLED]);
  const requirement = run.mock.calls[2]?.[1][4];
  expect(requirement).toMatch(/^=/);
  expect(requirement).toContain(`identifier "${ID}"`);
  expect(requirement).toContain(`certificate leaf[subject.OU] = "${TEAM}"`);
  expect(requirement).toContain("anchor apple generic");
  expect(requirement).toContain("1.2.840.113635.100.6.1.13");
  expect(run).toHaveBeenLastCalledWith("spctl", [
    "--assess",
    "--type",
    "execute",
    "--verbose=4",
    STAGED,
  ]);
});

it("rejects an ad-hoc installed app instead of weakening update verification", async () => {
  const run = vi.fn().mockResolvedValue({ stdout: "", stderr: "TeamIdentifier=not set\n" });
  await expect(verifyMacPublisher(STAGED, INSTALLED, ID, run)).rejects.toThrow(
    "Install the signed",
  );
  expect(run).toHaveBeenCalledTimes(2);
});

it.each([1, 3, 4])("fails closed when trust check %s fails", async (failure) => {
  let calls = 0;
  const run = vi.fn(async () => {
    calls += 1;
    if (calls === failure) throw new Error("rejected");
    return response;
  });
  await expect(verifyMacPublisher(STAGED, INSTALLED, ID, run)).rejects.toThrow("rejected");
  expect(run).toHaveBeenCalledTimes(failure);
});
