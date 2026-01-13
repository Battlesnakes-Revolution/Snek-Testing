import React from "react";

type Coordinate = { x: number; y: number };
type Snake = {
  id: string;
  name: string;
  health: number;
  body: Coordinate[];
  head: Coordinate;
  length: number;
  squad?: string;
  headEmoji?: string;
};
type Board = {
  height: number;
  width: number;
  food: Coordinate[];
  hazards: Coordinate[];
  snakes: Snake[];
};

type Props = {
  board: Board;
  youId: string;
  cellSize?: number;
};

const SNAKE_COLORS = ["#43b047", "#e55b3c", "#4285f4", "#f4b400", "#9c27b0", "#00bcd4"];
const YOU_SNAKE_COLOR = "#43b047";

function getSnakeColor(snakes: Snake[], snakeIndex: number, youId: string): string {
  const snake = snakes[snakeIndex];
  if (snake.id === youId) {
    return YOU_SNAKE_COLOR;
  }
  if (snake.squad) {
    const firstWithSameSquad = snakes.findIndex((s) => s.squad === snake.squad);
    return SNAKE_COLORS[firstWithSameSquad % SNAKE_COLORS.length];
  }
  return SNAKE_COLORS[snakeIndex % SNAKE_COLORS.length];
}

function getCellContent(board: Board, x: number, y: number, youId: string) {
  for (let i = 0; i < board.snakes.length; i++) {
    const snake = board.snakes[i];
    const bodyIndex = snake.body.findIndex((b) => b.x === x && b.y === y);
    if (bodyIndex !== -1) {
      const isHead = bodyIndex === 0;
      const isYou = snake.id === youId;
      const label = isYou ? "Y" : String(i + 1);
      const prevSegment = bodyIndex > 0 ? snake.body[bodyIndex - 1] : null;
      const nextSegment = bodyIndex < snake.body.length - 1 ? snake.body[bodyIndex + 1] : null;
      return {
        type: isHead ? "head" : "body",
        color: getSnakeColor(board.snakes, i, youId),
        isYou,
        label,
        headEmoji: snake.headEmoji,
        squad: snake.squad,
        prevSegment,
        nextSegment,
      };
    }
  }
  if (board.food.some((f) => f.x === x && f.y === y)) {
    return { type: "food" };
  }
  if (board.hazards.some((h) => h.x === x && h.y === y)) {
    return { type: "hazard" };
  }
  return null;
}

function getConnectors(
  x: number,
  y: number,
  prevSegment: Coordinate | null,
  nextSegment: Coordinate | null,
  color: string,
  cellSize: number
) {
  const connectors: Array<{ direction: "left" | "right" | "up" | "down" }> = [];
  const checkConnection = (seg: Coordinate | null) => {
    if (!seg) return;
    if (seg.x < x) connectors.push({ direction: "left" });
    if (seg.x > x) connectors.push({ direction: "right" });
    if (seg.y > y) connectors.push({ direction: "up" });
    if (seg.y < y) connectors.push({ direction: "down" });
  };
  checkConnection(prevSegment);
  checkConnection(nextSegment);

  const connectorSize = Math.max(2, Math.floor(cellSize * 0.15));

  return connectors.map((c, i) => {
    const style: React.CSSProperties = {
      position: "absolute",
      backgroundColor: color,
    };
    if (c.direction === "left") {
      style.left = `-${connectorSize}px`;
      style.top = "0";
      style.width = `${connectorSize}px`;
      style.height = "100%";
    } else if (c.direction === "right") {
      style.right = `-${connectorSize}px`;
      style.top = "0";
      style.width = `${connectorSize}px`;
      style.height = "100%";
    } else if (c.direction === "up") {
      style.top = `-${connectorSize}px`;
      style.left = "0";
      style.width = "100%";
      style.height = `${connectorSize}px`;
    } else if (c.direction === "down") {
      style.bottom = `-${connectorSize}px`;
      style.left = "0";
      style.width = "100%";
      style.height = `${connectorSize}px`;
    }
    return <div key={i} style={style} />;
  });
}

export default function BoardPreview({ board, youId, cellSize = 20 }: Props) {
  return (
    <div
      className="inline-grid gap-0.5 bg-night p-2 rounded"
      style={{ gridTemplateColumns: `repeat(${board.width}, 1fr)` }}
    >
      {Array.from({ length: board.height }).map((_, row) =>
        Array.from({ length: board.width }).map((_, col) => {
          const y = board.height - 1 - row;
          const x = col;
          const content = getCellContent(board, x, y, youId);
          const isSnake = content?.type === "head" || content?.type === "body";
          const connectors =
            isSnake && content.prevSegment !== undefined
              ? getConnectors(
                  x,
                  y,
                  content.prevSegment,
                  content.nextSegment ?? null,
                  content.color ?? "#43b047",
                  cellSize
                )
              : [];

          return (
            <div
              key={`${x}-${y}`}
              className={`rounded-sm flex items-center justify-center relative overflow-visible ${
                content?.type === "head"
                  ? "ring-1 ring-white/60 scale-110 z-10"
                  : "border border-sand/10"
              }`}
              style={{
                width: `${cellSize}px`,
                height: `${cellSize}px`,
                backgroundColor: content
                  ? content.type === "food"
                    ? "#22c55e"
                    : content.type === "hazard"
                    ? "#dc2626"
                    : content.color
                  : "#1a1a2e",
              }}
            >
              {connectors}
              {content?.type === "food" && (
                <span style={{ fontSize: `${Math.max(10, cellSize * 0.6)}px` }}>🎃</span>
              )}
              {content?.type === "hazard" && (
                <span style={{ fontSize: `${Math.max(10, cellSize * 0.6)}px` }}>❕</span>
              )}
              {content?.type === "head" && (
                <div className="flex flex-col items-center justify-center z-10">
                  <span
                    className="font-bold text-white drop-shadow-sm"
                    style={{ fontSize: `${Math.max(8, cellSize * 0.5)}px`, lineHeight: 1 }}
                  >
                    {content.isYou ? "Y" : (content.headEmoji || content.label)}
                  </span>
                  {content.squad && (
                    <span
                      className="text-white/90 font-medium drop-shadow-sm truncate max-w-full"
                      style={{ fontSize: `${Math.max(6, cellSize * 0.3)}px`, lineHeight: 1 }}
                    >
                      {content.squad}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
