"use client";

import { useEffect, useState } from "react";

const WELCOME_SCREEN_DURATION_MS = 2300;

export function useWelcomeScreenDelay(routeKey: string) {
  const [elapsedRouteKey, setElapsedRouteKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setElapsedRouteKey(routeKey),
      WELCOME_SCREEN_DURATION_MS,
    );

    return () => window.clearTimeout(timer);
  }, [routeKey]);

  return elapsedRouteKey !== routeKey;
}
