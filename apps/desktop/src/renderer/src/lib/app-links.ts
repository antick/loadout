import { NEW_ISSUE_URL, RELEASE_TAG_URL } from "@loadout/shared";

/** The release page of this version, with its notes. */
export function releaseNotesUrl(version: string): string {
  return `${RELEASE_TAG_URL}${encodeURIComponent(version)}`;
}

/** A new-issue form with the body filled in (version and system, never logs). */
export function bugReportUrl(body: string): string {
  return `${NEW_ISSUE_URL}?${new URLSearchParams({ body }).toString()}`;
}
