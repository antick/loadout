import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatCount,
  formatDate,
  formatDateTime,
  formatNameList,
  formatRelative,
  formatTimestampCompact,
  parseTimestampCompact,
} from "../src/format";

// The tests run in UTC (vitest.config.ts) but in the reader's language, so most expectations hold
// in any language; the exact English text is checked where the language is US English.
const US_ENGLISH = new Intl.DateTimeFormat().resolvedOptions().locale === "en-US";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** 19 September 2026, 15:30:45 UTC. */
const AT = Date.UTC(2026, 8, 19, 15, 30, 45);
const START_OF_DAY = Date.UTC(2026, 8, 19, 0, 0, 0);
const END_OF_DAY = Date.UTC(2026, 8, 19, 23, 59, 59);
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

describe("the test set-up", () => {
  it("runs in UTC whatever the computer's time zone", () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC");
  });
});

describe("formatDate and formatDateTime", () => {
  it("leave out a missing time", () => {
    for (const missing of [null, undefined, 0]) {
      expect(formatDate(missing)).toBe("");
      expect(formatDateTime(missing)).toBe("");
    }
  });

  it("give one date for a whole day and another for the next", () => {
    expect(formatDate(START_OF_DAY)).toBe(formatDate(END_OF_DAY));
    expect(formatDate(END_OF_DAY + SECOND)).not.toBe(formatDate(END_OF_DAY));
    expect(formatDate(AT)).toContain("2026");
  });

  it("add the time of day to the date", () => {
    expect(formatDateTime(AT)).toContain(formatDate(AT));
    expect(formatDateTime(AT + HOUR)).not.toBe(formatDateTime(AT));
  });

  it.runIf(US_ENGLISH)("read as a US English reader expects", () => {
    expect(formatDate(AT)).toBe("Sep 19, 2026");
    expect(formatDateTime(AT)).toMatch(/^Sep 19, 2026, 3:30\sPM$/);
  });
});

describe("formatRelative", () => {
  const now = AT;

  it("leaves out a missing time", () => {
    expect(formatRelative(null, now)).toBe("");
    expect(formatRelative(0, now)).toBe("");
  });

  it("picks the largest unit under a month, rounded", () => {
    expect(formatRelative(now - 30 * SECOND, now)).toBe(RELATIVE.format(-30, "second"));
    expect(formatRelative(now - 59 * SECOND, now)).toBe(RELATIVE.format(-59, "second"));
    expect(formatRelative(now - MINUTE, now)).toBe(RELATIVE.format(-1, "minute"));
    expect(formatRelative(now - 3 * MINUTE - 20 * SECOND, now)).toBe(RELATIVE.format(-3, "minute"));
    expect(formatRelative(now - 5 * HOUR, now)).toBe(RELATIVE.format(-5, "hour"));
    expect(formatRelative(now - 2 * DAY, now)).toBe(RELATIVE.format(-2, "day"));
    expect(formatRelative(now + DAY, now)).toBe(RELATIVE.format(1, "day"));
  });

  it("gives the date from a month away on, past or future", () => {
    expect(formatRelative(now - 30 * DAY, now)).toBe(formatDate(now - 30 * DAY));
    expect(formatRelative(now + 45 * DAY, now)).toBe(formatDate(now + 45 * DAY));
  });

  it.runIf(US_ENGLISH)("reads as a US English reader expects", () => {
    expect(formatRelative(now, now)).toBe("now");
    expect(formatRelative(now - 3 * MINUTE, now)).toBe("3 minutes ago");
    expect(formatRelative(now + DAY, now)).toBe("tomorrow");
  });
});

describe("formatTimestampCompact and parseTimestampCompact", () => {
  it("write the UTC time as digits", () => {
    expect(formatTimestampCompact(AT)).toBe("20260919-153045");
    expect(formatTimestampCompact(Date.UTC(2001, 0, 2, 3, 4, 5))).toBe("20010102-030405");
  });

  it("read back what they wrote, to the second", () => {
    for (const ms of [AT, START_OF_DAY, END_OF_DAY, Date.UTC(1999, 11, 31, 23, 59, 59)]) {
      expect(parseTimestampCompact(formatTimestampCompact(ms))).toBe(ms);
    }
    expect(parseTimestampCompact(formatTimestampCompact(AT + 999))).toBe(AT);
  });

  it("refuse anything else", () => {
    for (const text of ["", "2026-09-19", "20260919153045", "20260919-15304", "x0260919-153045"]) {
      expect(parseTimestampCompact(text)).toBeNull();
    }
  });
});

describe("formatBytes", () => {
  it("counts in steps of 1024, one decimal below 100", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(100 * 1024)).toBe("100 KB");
    expect(formatBytes(5.5 * 1024 ** 2)).toBe("5.5 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.0 GB");
  });

  it("stops at terabytes", () => {
    expect(formatBytes(2 * 1024 ** 4)).toBe("2.0 TB");
    expect(formatBytes(1024 ** 5)).toBe("1024 TB");
  });
});

describe("formatCount", () => {
  const compact = new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  it("shortens large counts in the reader's language", () => {
    for (const count of [7, 999, 1234, 34_000, 5_600_000]) {
      expect(formatCount(count)).toBe(compact.format(count));
    }
  });

  it.runIf(US_ENGLISH)("reads as a US English reader expects", () => {
    expect([999, 1234, 34_000, 5_600_000].map(formatCount)).toEqual(["999", "1.2K", "34K", "5.6M"]);
  });
});

describe("formatNameList", () => {
  it("joins names in order", () => {
    expect(formatNameList([])).toBe("");
    expect(formatNameList(["Codex"])).toBe("Codex");
    const joined = formatNameList(["Codex", "Goose", "Warp"]);
    expect(joined.indexOf("Codex")).toBeLessThan(joined.indexOf("Goose"));
    expect(joined.indexOf("Goose")).toBeLessThan(joined.indexOf("Warp"));
  });

  it.runIf(US_ENGLISH)("reads as a US English reader expects", () => {
    expect(formatNameList(["Codex", "Goose"])).toBe("Codex and Goose");
    expect(formatNameList(["Codex", "Goose", "Warp"])).toBe("Codex, Goose, and Warp");
  });
});
