import { type ClientRect, type KeyboardCoordinateGetter } from "@dnd-kit/core";

const STEP: Record<string, -1 | 1> = { ArrowLeft: -1, ArrowRight: 1 };

const centerX = (r: ClientRect) => r.left + r.width / 2;

/**
 * Keyboard drag across columns: each Left/Right arrow jumps the picked-up card to the centre of
 * the previous/next column (instead of dnd-kit's default 25px nudge), so one keystroke = one
 * column. Up/Down do nothing — cards keep server order inside a column.
 */
export const columnKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context, currentCoordinates },
) => {
  const step = STEP[event.code];
  const { collisionRect, droppableContainers, droppableRects } = context;
  if (!step || !collisionRect) return undefined;
  event.preventDefault();

  const columns = droppableContainers
    .getEnabled()
    .map((c) => droppableRects.get(c.id))
    .filter((r): r is ClientRect => r !== undefined)
    .sort((a, b) => a.left - b.left);
  if (columns.length === 0) return undefined;

  const x = centerX(collisionRect);
  const distance = (r: ClientRect) => Math.abs(centerX(r) - x);
  const current = columns.reduce(
    (best, r, i) => (distance(r) < distance(columns[best]!) ? i : best),
    0,
  );
  const target = columns[current + step];
  if (!target) return currentCoordinates;
  return { x: centerX(target) - collisionRect.width / 2, y: currentCoordinates.y };
};
