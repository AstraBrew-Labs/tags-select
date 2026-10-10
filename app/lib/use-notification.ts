"use client";

import { useEffect, useRef } from "react";
import { Notification, type NotificationType } from "animal-island-ui";

export function useNotification(
  message: string | null,
  type: NotificationType = "error",
) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const next = message ? `${type}:${message}` : null;
    // Keep rerenders and Strict Mode effect replays from repeating a message.
    if (message && next !== previous.current) {
      Notification[type]({ message, duration: type === "error" ? 7 : 4.5 });
    }
    previous.current = next;
  }, [message, type]);
}
