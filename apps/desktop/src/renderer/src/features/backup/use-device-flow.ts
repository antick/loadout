import { ApiError, type DeviceFlowStart, type GithubConnectResult } from "@skillboard/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOpenExternal } from "@/hooks/mutations/app";
import { useGithubDevicePoll, useGithubDeviceStart } from "@/hooks/mutations/backup-page";
import { toastBackupError } from "@/lib/backup-errors";
import { DEVICE_POLL_MIN_INTERVAL_S, DEVICE_POLL_SLOW_DOWN_S, MS_PER_SECOND } from "./constants";

export type DeviceFlowPhase = "idle" | "starting" | "waiting" | "expired";

export interface DeviceFlow {
  phase: DeviceFlowPhase;
  /** The running sign-in: the code to type and where to type it. */
  session: DeviceFlowStart | null;
  begin(repoName: string): Promise<void>;
  cancel(): void;
}

/**
 * "Sign in with GitHub" without the token ever reaching the UI: start, open github.com, then ask
 * the backend every few seconds until the user approves, the code expires, or they cancel.
 */
export function useDeviceFlow(onConnected: (result: GithubConnectResult) => void): DeviceFlow {
  const { t } = useTranslation();
  const start = useGithubDeviceStart();
  const poll = useGithubDevicePoll();
  const openExternal = useOpenExternal();
  const [phase, setPhase] = useState<DeviceFlowPhase>("idle");
  const [session, setSession] = useState<DeviceFlowStart | null>(null);
  const timer = useRef<number | null>(null);
  // Bumped on every stop, so answers of an abandoned sign-in are ignored when they arrive.
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current += 1;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const begin = async (repoName: string): Promise<void> => {
    stop();
    const mine = generation.current;
    const isCurrent = (): boolean => mine === generation.current;
    setPhase("starting");

    let started: DeviceFlowStart;
    try {
      started = await start.mutateAsync();
    } catch {
      // The start hook already toasted why.
      if (isCurrent()) setPhase("idle");
      return;
    }
    if (!isCurrent()) return;

    setSession(started);
    setPhase("waiting");
    openExternal.mutate(started.verificationUri);

    const deadline = Date.now() + started.expiresIn * MS_PER_SECOND;
    let intervalS = Math.max(started.interval, DEVICE_POLL_MIN_INTERVAL_S);
    const schedule = (): void => {
      timer.current = window.setTimeout(() => void tick(), intervalS * MS_PER_SECOND);
    };
    const tick = async (): Promise<void> => {
      if (!isCurrent()) return;
      if (Date.now() >= deadline) {
        setPhase("expired");
        return;
      }
      try {
        const answer = await poll.mutateAsync({ deviceCode: started.deviceCode, repoName });
        if (!isCurrent()) return;
        if (answer.status === "connected" && answer.result) {
          setPhase("idle");
          setSession(null);
          onConnected(answer.result);
          return;
        }
        if (answer.status === "slow_down") intervalS += DEVICE_POLL_SLOW_DOWN_S;
        schedule();
      } catch (error) {
        if (!isCurrent()) return;
        const expired = error instanceof ApiError && error.code === "GITHUB_DEVICE_EXPIRED";
        if (!expired) toastBackupError(error, t);
        setPhase(expired ? "expired" : "idle");
        if (!expired) setSession(null);
      }
    };
    schedule();
  };

  const cancel = (): void => {
    stop();
    setPhase("idle");
    setSession(null);
  };

  return { phase, session, begin, cancel };
}
