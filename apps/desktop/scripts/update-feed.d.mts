// Types for update-feed.mjs, so the main-process tests can import it.
export declare const FEED_FILE: string;
export declare function targetForFile(name: string): string | null;
export declare function buildFeed(options: {
  dir: string;
  version: string;
  repo?: string;
  baseUrl?: string;
}): Promise<{
  version: string;
  releasedAt: string;
  releaseUrl: string | null;
  files: Record<string, { name: string; url: string; sha256: string; size: number }>;
}>;
