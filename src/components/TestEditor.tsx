import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";

type Coordinate = { x: number; y: number };
type Snake = {
  id: string;
  name: string;
  health: number;
  body: Coordinate[];
  head: Coordinate;
  length: number;
  latency?: string;
  shout?: string;
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
type Game = {
  id?: string;
  ruleset?: {
    name?: string;
    version?: string;
    settings?: {
      foodSpawnChance?: number;
      minimumFood?: number;
      hazardDamagePerTurn?: number;
      hazardMap?: string;
    };
  };
  map?: string;
  timeout?: number;
};

type TestData = {
  _id?: Id<"tests">;
  name: string;
  board: Board;
  game?: Game;
  turn: number;
  youId: string;
  expectedSafeMoves: string[];
};

type Props = {
  initialData?: TestData | null;
  onSave: (data: Omit<TestData, "_id">) => void;
  onCancel: () => void;
};

const SNAKE_COLORS = ["#43b047", "#e55b3c", "#4285f4", "#f4b400", "#9c27b0", "#00bcd4"];
const SNAKE_EMOJIS = ["🐍", "😎", "🔥", "💀", "🎯", "⚡", "🌟", "🦎", "🐉", "👑", "💎", "🎮"];

function makeDefaultSnake(id: string, name: string, x: number): Snake {
  return {
    id,
    name,
    health: 100,
    body: [
      { x, y: 5 },
      { x, y: 4 },
      { x, y: 3 },
    ],
    head: { x, y: 5 },
    length: 3,
  };
}

export default function TestEditor({ initialData, onSave, onCancel }: Props) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [turn, setTurn] = useState(initialData?.turn ?? 0);
  const [boardWidth, setBoardWidth] = useState(initialData?.board?.width ?? 11);
  const [boardHeight, setBoardHeight] = useState(initialData?.board?.height ?? 11);
  const [food, setFood] = useState<Coordinate[]>(initialData?.board?.food ?? []);
  const [hazards, setHazards] = useState<Coordinate[]>(initialData?.board?.hazards ?? []);
  const [snakes, setSnakes] = useState<Snake[]>(
    initialData?.board?.snakes ?? [makeDefaultSnake("snake-1", "You", 5)]
  );
  const [youId, setYouId] = useState(initialData?.youId ?? "snake-1");
  const [expectedSafeMoves, setExpectedSafeMoves] = useState<string[]>(
    initialData?.expectedSafeMoves ?? []
  );
  const [tool, setTool] = useState<"food" | "hazard" | "snake-head" | "snake-body" | "eraser">("food");
  const [selectedSnakeIndex, setSelectedSnakeIndex] = useState(0);

  const handleCellClick = (x: number, y: number) => {
    if (tool === "food") {
      const exists = food.some((f) => f.x === x && f.y === y);
      if (exists) {
        setFood(food.filter((f) => !(f.x === x && f.y === y)));
      } else {
        setFood([...food, { x, y }]);
      }
    } else if (tool === "hazard") {
      const exists = hazards.some((h) => h.x === x && h.y === y);
      if (exists) {
        setHazards(hazards.filter((h) => !(h.x === x && h.y === y)));
      } else {
        setHazards([...hazards, { x, y }]);
      }
    } else if (tool === "snake-head" && snakes[selectedSnakeIndex]) {
      const newSnakes = [...snakes];
      const snake = { ...newSnakes[selectedSnakeIndex] };
      snake.head = { x, y };
      if (snake.body.length === 0) {
        snake.body = [{ x, y }];
        snake.length = 1;
      } else {
        snake.body = [{ x, y }, ...snake.body.slice(1)];
      }
      newSnakes[selectedSnakeIndex] = snake;
      setSnakes(newSnakes);
    } else if (tool === "snake-body" && snakes[selectedSnakeIndex]) {
      const newSnakes = [...snakes];
      const snake = { ...newSnakes[selectedSnakeIndex] };
      const inBody = snake.body.findIndex((b) => b.x === x && b.y === y);
      if (inBody > 0) {
        snake.body = snake.body.filter((_, i) => i !== inBody);
      } else if (inBody === -1) {
        snake.body = [...snake.body, { x, y }];
      }
      snake.length = snake.body.length;
      newSnakes[selectedSnakeIndex] = snake;
      setSnakes(newSnakes);
    } else if (tool === "eraser") {
      setFood(food.filter((f) => !(f.x === x && f.y === y)));
      setHazards(hazards.filter((h) => !(h.x === x && h.y === y)));
      const newSnakes = snakes.map((snake) => {
        const inBody = snake.body.findIndex((b) => b.x === x && b.y === y);
        if (inBody === -1) return snake;
        if (inBody === 0) {
          return { ...snake, body: [], head: { x: -1, y: -1 }, length: 0 };
        }
        const newBody = snake.body.filter((_, i) => i !== inBody);
        return { ...snake, body: newBody, length: newBody.length };
      });
      setSnakes(newSnakes);
    }
  };

  const addSnake = () => {
    const id = `snake-${snakes.length + 1}`;
    const newSnake: Snake = {
      id,
      name: `Snake ${snakes.length + 1}`,
      health: 100,
      body: [],
      head: { x: -1, y: -1 },
      length: 0,
    };
    setSnakes([...snakes, newSnake]);
    setSelectedSnakeIndex(snakes.length);
    setTool("snake-head");
  };

  const removeSnake = (index: number) => {
    if (snakes.length <= 1) return;
    const removed = snakes[index];
    const newSnakes = snakes.filter((_, i) => i !== index);
    setSnakes(newSnakes);
    if (youId === removed.id) {
      setYouId(newSnakes[0].id);
    }
    if (selectedSnakeIndex >= newSnakes.length) {
      setSelectedSnakeIndex(newSnakes.length - 1);
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      alert("Please enter a test name");
      return;
    }
    if (expectedSafeMoves.length === 0) {
      alert("Please select at least one expected safe move");
      return;
    }
    const unplacedSnakes = snakes.filter((s) => s.body.length === 0);
    if (unplacedSnakes.length > 0) {
      alert(`Please place all snakes on the board. Unplaced: ${unplacedSnakes.map((s) => s.name).join(", ")}`);
      return;
    }
    const youSnake = snakes.find((s) => s.id === youId);
    if (!youSnake || youSnake.body.length === 0) {
      alert("Please place your snake (the one marked as 'You') on the board");
      return;
    }
    onSave({
      name,
      board: {
        width: boardWidth,
        height: boardHeight,
        food,
        hazards,
        snakes,
      },
      turn,
      youId,
      expectedSafeMoves,
    });
  };

  const getSnakeColor = (snakeIndex: number) => {
    const snake = snakes[snakeIndex];
    if (snake.squad) {
      const firstSnakeWithSameSquad = snakes.findIndex((s) => s.squad === snake.squad);
      return SNAKE_COLORS[firstSnakeWithSameSquad % SNAKE_COLORS.length];
    }
    return SNAKE_COLORS[snakeIndex % SNAKE_COLORS.length];
  };

  const getCellContent = (x: number, y: number) => {
    for (let i = 0; i < snakes.length; i++) {
      const snake = snakes[i];
      const bodyIndex = snake.body.findIndex((b) => b.x === x && b.y === y);
      if (bodyIndex !== -1) {
        const isHead = bodyIndex === 0;
        const prevSegment = bodyIndex > 0 ? snake.body[bodyIndex - 1] : null;
        const nextSegment = bodyIndex < snake.body.length - 1 ? snake.body[bodyIndex + 1] : null;
        return {
          type: isHead ? "head" : "body",
          color: getSnakeColor(i),
          isYou: snake.id === youId,
          prevSegment,
          nextSegment,
          health: snake.health,
          headEmoji: snake.headEmoji,
        };
      }
    }
    if (food.some((f) => f.x === x && f.y === y)) {
      return { type: "food" };
    }
    if (hazards.some((h) => h.x === x && h.y === y)) {
      return { type: "hazard" };
    }
    return null;
  };

  const getConnectors = (x: number, y: number, prevSegment: Coordinate | null, nextSegment: Coordinate | null, color: string) => {
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
    return connectors.map((c, i) => {
      const style: React.CSSProperties = {
        position: "absolute",
        backgroundColor: color,
      };
      if (c.direction === "left") {
        style.left = "-4px";
        style.top = "0";
        style.width = "4px";
        style.height = "100%";
      } else if (c.direction === "right") {
        style.right = "-4px";
        style.top = "0";
        style.width = "4px";
        style.height = "100%";
      } else if (c.direction === "up") {
        style.top = "-4px";
        style.left = "0";
        style.width = "100%";
        style.height = "4px";
      } else if (c.direction === "down") {
        style.bottom = "-4px";
        style.left = "0";
        style.width = "100%";
        style.height = "4px";
      }
      return <div key={i} style={style} />;
    });
  };

  return (
    <div className="bg-ink border border-sand/20 rounded-lg p-6">
      <h2 className="text-xl font-bold text-sand mb-4">
        {initialData?._id ? "Edit Test" : "Create Test"}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="mb-4">
            <label className="block text-sand/80 text-sm mb-1">Test Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-night border border-sand/20 rounded px-3 py-2 text-sand focus:outline-none focus:border-lagoon"
              placeholder="e.g., Avoid Wall Collision"
            />
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sand/80 text-sm mb-1">Turn</label>
              <input
                type="number"
                value={turn}
                onChange={(e) => setTurn(parseInt(e.target.value) || 0)}
                className="w-full bg-night border border-sand/20 rounded px-3 py-2 text-sand focus:outline-none focus:border-lagoon"
              />
            </div>
            <div>
              <label className="block text-sand/80 text-sm mb-1">Width</label>
              <input
                type="number"
                value={boardWidth}
                onChange={(e) => setBoardWidth(Math.max(7, Math.min(21, parseInt(e.target.value) || 11)))}
                className="w-full bg-night border border-sand/20 rounded px-3 py-2 text-sand focus:outline-none focus:border-lagoon"
              />
            </div>
            <div>
              <label className="block text-sand/80 text-sm mb-1">Height</label>
              <input
                type="number"
                value={boardHeight}
                onChange={(e) => setBoardHeight(Math.max(7, Math.min(21, parseInt(e.target.value) || 11)))}
                className="w-full bg-night border border-sand/20 rounded px-3 py-2 text-sand focus:outline-none focus:border-lagoon"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sand/80 text-sm mb-1">Tool</label>
            <div className="flex flex-wrap gap-2">
              {(["food", "hazard", "snake-head", "snake-body", "eraser"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTool(t)}
                  className={`px-3 py-1 rounded text-sm ${tool === t ? "bg-lagoon text-ink" : "bg-sand/10 text-sand"}`}
                >
                  {t === "food" ? "Food" : t === "hazard" ? "Hazard" : t === "snake-head" ? "Snake Head" : t === "snake-body" ? "Snake Body" : "Eraser"}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sand/80 text-sm mb-1">Snakes</label>
            <div className="space-y-3">
              {snakes.map((snake, i) => (
                <div key={snake.id} className="bg-night/50 p-2 rounded border border-sand/10">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: getSnakeColor(i) }}
                    />
                    <input
                      type="text"
                      value={snake.name}
                      onChange={(e) => {
                        const newSnakes = [...snakes];
                        newSnakes[i] = { ...snake, name: e.target.value };
                        setSnakes(newSnakes);
                      }}
                      placeholder="Name"
                      className="flex-1 bg-night border border-sand/20 rounded px-2 py-1 text-sand text-sm"
                    />
                    <button
                      onClick={() => setSelectedSnakeIndex(i)}
                      className={`px-2 py-1 text-xs rounded ${selectedSnakeIndex === i ? "bg-lagoon text-ink" : "bg-sand/10 text-sand"}`}
                    >
                      Select
                    </button>
                    <button
                      onClick={() => setYouId(snake.id)}
                      className={`px-2 py-1 text-xs rounded ${youId === snake.id ? "bg-moss text-ink" : "bg-sand/10 text-sand"}`}
                    >
                      You
                    </button>
                    {snakes.length > 1 && (
                      <button
                        onClick={() => removeSnake(i)}
                        className="px-2 py-1 text-xs rounded bg-ember/20 text-ember"
                      >
                        X
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-sand/60 text-xs">Health:</label>
                    <input
                      type="number"
                      value={snake.health}
                      onChange={(e) => {
                        const newSnakes = [...snakes];
                        newSnakes[i] = { ...snake, health: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) };
                        setSnakes(newSnakes);
                      }}
                      className="w-16 bg-night border border-sand/20 rounded px-2 py-1 text-sand text-sm"
                    />
                    <label className="text-sand/60 text-xs ml-2">Squad:</label>
                    <input
                      type="text"
                      value={snake.squad ?? ""}
                      onChange={(e) => {
                        const newSnakes = [...snakes];
                        newSnakes[i] = { ...snake, squad: e.target.value || undefined };
                        setSnakes(newSnakes);
                      }}
                      placeholder="Optional"
                      className="w-20 bg-night border border-sand/20 rounded px-2 py-1 text-sand text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-sand/60 text-xs">Head Emoji:</label>
                    <div className="flex gap-1 flex-wrap">
                      {SNAKE_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            const newSnakes = [...snakes];
                            newSnakes[i] = { ...snake, headEmoji: emoji };
                            setSnakes(newSnakes);
                          }}
                          className={`w-6 h-6 rounded text-sm flex items-center justify-center ${snake.headEmoji === emoji ? "bg-lagoon" : "bg-sand/10 hover:bg-sand/20"}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={addSnake}
                className="text-sm text-lagoon hover:underline"
              >
                + Add Snake
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sand/80 text-sm mb-1">Expected Safe Moves</label>
            <div className="flex gap-2">
              {["up", "down", "left", "right"].map((move) => (
                <button
                  key={move}
                  onClick={() => {
                    if (expectedSafeMoves.includes(move)) {
                      setExpectedSafeMoves(expectedSafeMoves.filter((m) => m !== move));
                    } else {
                      setExpectedSafeMoves([...expectedSafeMoves, move]);
                    }
                  }}
                  className={`px-3 py-1 rounded text-sm ${expectedSafeMoves.includes(move) ? "bg-moss text-ink" : "bg-sand/10 text-sand"}`}
                >
                  {move}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="bg-lagoon text-ink px-4 py-2 rounded hover:bg-lagoon/80"
            >
              Save Test
            </button>
            <button
              onClick={onCancel}
              className="bg-sand/10 text-sand px-4 py-2 rounded hover:bg-sand/20"
            >
              Cancel
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sand/80 text-sm mb-1">Board Preview</label>
          <div
            className="inline-grid gap-1 bg-night p-2 rounded"
            style={{ gridTemplateColumns: `repeat(${boardWidth}, 1fr)` }}
          >
            {Array.from({ length: boardHeight }).map((_, row) =>
              Array.from({ length: boardWidth }).map((_, col) => {
                const y = boardHeight - 1 - row;
                const x = col;
                const content = getCellContent(x, y);
                const isSnake = content?.type === "head" || content?.type === "body";
                const connectors = isSnake && content.prevSegment !== undefined
                  ? getConnectors(x, y, content.prevSegment, content.nextSegment ?? null, content.color ?? "#43b047")
                  : [];
                return (
                  <button
                    key={`${x}-${y}`}
                    onClick={() => handleCellClick(x, y)}
                    className="w-7 h-7 rounded border border-sand/20 relative flex items-center justify-center text-[10px] font-bold overflow-visible"
                    style={{
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
                      <span className="text-sm">🎃</span>
                    )}
                    {content?.type === "hazard" && (
                      <span className="text-sm">❗</span>
                    )}
                    {content?.type === "head" && (
                      <span className="text-white z-10">{content.headEmoji || (content.isYou ? "👍" : "🐍")}</span>
                    )}
                    {content?.type === "body" && content.health !== undefined && content.nextSegment === null && (
                      <span className="text-white text-[9px] z-10">{content.health}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <p className="text-sand/40 text-xs mt-2">Click cells to place/remove elements</p>
        </div>
      </div>
    </div>
  );
}
