import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const TEAM_PATTERN = /^TeamIdentifier=([A-Z0-9]{10})$/m;
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9.-]+$/;

type Run = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

/** Trust the installed publisher, rather than accepting any intact (even ad-hoc) signature. */
export async function verifyMacPublisher(
  bundle: string,
  installedBundle: string,
  bundleId: string,
  run: Run = (command, args) => exec(command, args),
): Promise<void> {
  if (!BUNDLE_ID_PATTERN.test(bundleId)) throw new Error("Invalid application identity");
  await run("codesign", ["--verify", "--deep", "--strict", installedBundle]);
  const installed = await run("codesign", ["--display", "--verbose=4", installedBundle]);
  const team = TEAM_PATTERN.exec(installed.stderr)?.[1];
  if (!team) {
    throw new Error(
      "This copy has no Apple developer signature. Install the signed Loadout release first.",
    );
  }
  const requirement = [
    `identifier "${bundleId}"`,
    "anchor apple generic",
    "certificate 1[field.1.2.840.113635.100.6.2.6] exists",
    "certificate leaf[field.1.2.840.113635.100.6.1.13] exists",
    `certificate leaf[subject.OU] = "${team}"`,
  ].join(" and ");
  await run("codesign", ["--verify", "--deep", "--strict", "-R", requirement, bundle]);
  await run("spctl", ["--assess", "--type", "execute", "--verbose=4", bundle]);
}
