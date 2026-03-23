import { useState, useEffect, useRef, useCallback } from 'react';

const TURN_SECONDS = 90;

export function useTurnCountdown(turnStartedAt: string | null | undefined, status: string) {
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derive remaining time purely from the server-provided timestamp.
  // This means the source of truth is always the server — not a local counter.
  const compute = useCallback(() => {
    if (!turnStartedAt) {
      setSecondsLeft(TURN_SECONDS);
      return;
    }
    const elapsed   = (Date.now() - new Date(turnStartedAt).getTime()) / 1000;
    const remaining = Math.max(0, Math.ceil(TURN_SECONDS - elapsed));
    setSecondsLeft(remaining);
  }, [turnStartedAt]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (status !== 'playing' || !turnStartedAt) {
      setSecondsLeft(TURN_SECONDS);
      return;
    }

    // Tick immediately on mount / turn change
    compute();

    // Keep updating every 500ms while the tab is active.
    // Browsers throttle setInterval in hidden tabs, but that's fine — we
    // re-sync the display the instant the user returns (see listeners below).
    intervalRef.current = setInterval(compute, 500);

    // Re-compute the moment the user switches back to this tab
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') compute();
    };

    // Re-compute when the browser window itself regains focus (alt-tab, etc.)
    const onFocus = () => compute();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [turnStartedAt, status, compute]);

  const isUrgent   = secondsLeft <= 15;
  const isCritical = secondsLeft <= 5;
  const progress   = secondsLeft / TURN_SECONDS;

  return { secondsLeft, isUrgent, isCritical, progress };
}
