/** Geometry only; menu colors, borders and shape remain owned by the UI library. */
export function selectMenuLayout(
  rect: { top: number; bottom: number; left: number },
  viewport: { width: number; height: number },
) {
  const gap = 8;
  const below = Math.max(0, viewport.height - rect.bottom - gap);
  const above = Math.max(0, rect.top - gap);
  const direction = below < 200 && above > below ? "up" : "down";
  return {
    direction,
    maxHeight: Math.max(1, Math.min(320, direction === "up" ? above : below)),
    maxWidth: Math.max(1, viewport.width - Math.max(0, rect.left) - 12),
  } as const;
}
