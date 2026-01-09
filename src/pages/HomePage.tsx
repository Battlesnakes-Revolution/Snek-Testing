import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../contexts/AuthContext";
import type { Id } from "../../convex/_generated/dataModel";

type Coordinate = { x: number; y: number };
type Snake = {
  id: string;
  name: string;
  health: number;
  body: Coordinate[];
  head: Coordinate;
  length: number;
};
type Board = {
  height: number;
  width: number;
  food: Coordinate[];
  hazards: Coordinate[];
  snakes: Snake[];
};

type Test = {
  _id: Id<"tests">;
  name: string;
  board: Board;
  turn: number;
  youId: string;
  expectedSafeMoves: string[];
};

type RunResult = {
  ok: boolean;
  move?: string | null;
  error?: string;
};

const SNAKE_COLORS = ["#43b047", "#e55b3c", "#4285f4", "#f4b400", "#9c27b0", "#00bcd4"];

export default function HomePage() {
  const { user, logout } = useAuth();
  const [botUrl, setBotUrl] = useState(() => localStorage.getItem("botUrl") ?? "");
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [runningIds, setRunningIds] = useState<Record<string, boolean>>({});
  const [expandedTest, setExpandedTest] = useState<Id<"tests"> | null>(null);

  const publicTests = useQuery(api.battlesnake.listPublicTests);
  const runTest = useAction(api.battlesnake.runTest);

  const handleRunTest = async (test: Test) => {
    if (!botUrl.trim()) return;
    localStorage.setItem("botUrl", botUrl);
    setRunningIds((prev) => ({ ...prev, [test._id]: true }));
    try {
      const result = await runTest({ testId: test._id, url: botUrl });
      setResults((prev) => ({ ...prev, [test._id]: result }));
    } finally {
      setRunningIds((prev) => ({ ...prev, [test._id]: false }));
    }
  };

  const handleRunAll = async () => {
    if (!botUrl.trim() || !publicTests) return;
    localStorage.setItem("botUrl", botUrl);
    for (const test of publicTests) {
      setRunningIds((prev) => ({ ...prev, [test._id]: true }));
      try {
        const result = await runTest({ testId: test._id, url: botUrl });
        setResults((prev) => ({ ...prev, [test._id]: result }));
      } finally {
        setRunningIds((prev) => ({ ...prev, [test._id]: false }));
      }
    }
  };

  const getCellContent = (board: Board, x: number, y: number, youId: string) => {
    for (let i = 0; i < board.snakes.length; i++) {
      const snake = board.snakes[i];
      if (snake.head.x === x && snake.head.y === y) {
        const isYou = snake.id === youId;
        const label = isYou ? "Y" : String(i + 1);
        return { type: "head", color: SNAKE_COLORS[i % SNAKE_COLORS.length], isYou, label };
      }
      if (snake.body.some((b, idx) => idx > 0 && b.x === x && b.y === y)) {
        return { type: "body", color: SNAKE_COLORS[i % SNAKE_COLORS.length] };
      }
    }
    if (board.food.some((f) => f.x === x && f.y === y)) {
      return { type: "food" };
    }
    if (board.hazards.some((h) => h.x === x && h.y === y)) {
      return { type: "hazard" };
    }
    return null;
  };

  const passCount = publicTests?.filter((t) => {
    const r = results[t._id];
    return r?.ok && t.expectedSafeMoves.includes(r.move ?? "");
  }).length ?? 0;

  return (
    <div className="min-h-screen bg-night p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-sand">Battlesnake Tests</h1>
            <p className="text-sand/60">Test your Battlesnake against curated scenarios</p>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Link to="/dashboard" className="text-lagoon hover:underline">Dashboard</Link>
                {user.isAdmin && (
                  <Link to="/admin" className="text-lagoon hover:underline">Admin</Link>
                )}
                <button onClick={logout} className="text-sand/60 hover:text-sand">Log Out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-lagoon hover:underline">Log In</Link>
                <Link to="/register" className="bg-lagoon text-ink px-4 py-2 rounded hover:bg-lagoon/80">
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </header>

        <div className="bg-ink border border-sand/20 rounded-lg p-4 mb-6">
          <label className="block text-sand/80 text-sm mb-1">Your Bot URL</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={botUrl}
              onChange={(e) => setBotUrl(e.target.value)}
              placeholder="https://your-battlesnake.com"
              className="flex-1 bg-night border border-sand/20 rounded px-3 py-2 text-sand focus:outline-none focus:border-lagoon"
            />
            <button
              onClick={handleRunAll}
              disabled={!botUrl.trim() || !publicTests?.length}
              className="bg-lagoon text-ink px-4 py-2 rounded hover:bg-lagoon/80 disabled:opacity-50"
            >
              Run All Tests
            </button>
          </div>
          {Object.keys(results).length > 0 && publicTests && (
            <p className="text-sand/60 text-sm mt-2">
              Results: {passCount}/{publicTests.length} passed
            </p>
          )}
        </div>

        <h2 className="text-xl text-sand mb-4">Public Tests</h2>

        {publicTests === undefined ? (
          <p className="text-sand/60">Loading...</p>
        ) : publicTests.length === 0 ? (
          <div className="bg-ink border border-sand/20 rounded-lg p-8 text-center">
            <p className="text-sand/60 mb-4">No public tests available yet.</p>
            {!user && (
              <p className="text-sand/40 text-sm">
                <Link to="/register" className="text-lagoon hover:underline">Create an account</Link> to submit your own tests for review.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {publicTests.map((test) => {
              const result = results[test._id];
              const isRunning = runningIds[test._id];
              const passed = result?.ok && test.expectedSafeMoves.includes(result.move ?? "");
              return (
                <div key={test._id} className="bg-ink border border-sand/20 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-sand">{test.name}</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedTest(expandedTest === test._id ? null : test._id)}
                        className="text-sm px-3 py-1 bg-sand/10 text-sand rounded hover:bg-sand/20"
                      >
                        {expandedTest === test._id ? "Hide" : "Show"}
                      </button>
                      <button
                        onClick={() => handleRunTest(test)}
                        disabled={isRunning || !botUrl.trim()}
                        className="text-sm px-3 py-1 bg-lagoon text-ink rounded disabled:opacity-50"
                      >
                        {isRunning ? "Running..." : "Run"}
                      </button>
                    </div>
                  </div>
                  <p className="text-sand/60 text-sm">
                    Turn {test.turn} | Expected: {test.expectedSafeMoves.join(", ")}
                  </p>

                  {expandedTest === test._id && (
                    <div className="my-4">
                      <div
                        className="inline-grid gap-0.5 bg-night p-2 rounded"
                        style={{ gridTemplateColumns: `repeat(${test.board.width}, 1fr)` }}
                      >
                        {Array.from({ length: test.board.height }).map((_, row) =>
                          Array.from({ length: test.board.width }).map((_, col) => {
                            const y = test.board.height - 1 - row;
                            const x = col;
                            const content = getCellContent(test.board, x, y, test.youId);
                            return (
                              <div
                                key={`${x}-${y}`}
                                className={`w-5 h-5 rounded-sm flex items-center justify-center ${content?.type === "head" ? "ring-1 ring-white/60 scale-110" : "border border-sand/10"}`}
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
                                {content?.type === "head" && (
                                  <span className="text-[8px] font-bold text-white drop-shadow-sm">
                                    {content.label}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {result && (
                    <div className={`mt-2 p-2 rounded text-sm ${passed ? "bg-moss/20 text-moss" : "bg-ember/20 text-ember"}`}>
                      {result.ok ? (
                        <span>Move: {result.move} {passed ? "(PASS)" : "(FAIL)"}</span>
                      ) : (
                        <span>Error: {result.error}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
