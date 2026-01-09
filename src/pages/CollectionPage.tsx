import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import BoardPreview from "../components/BoardPreview";

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

export default function CollectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const [botUrl, setBotUrl] = useState(() => localStorage.getItem("botUrl") ?? "");
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [runningIds, setRunningIds] = useState<Record<string, boolean>>({});
  const [expandedTest, setExpandedTest] = useState<Id<"tests"> | null>(null);

  const data = useQuery(api.battlesnake.getCollectionBySlug, slug ? { slug } : "skip");
  const runTest = useAction(api.battlesnake.runTest);

  if (!slug) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center">
        <p className="text-sand">Invalid collection link.</p>
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center">
        <p className="text-sand">Loading...</p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl text-sand mb-2">Collection Not Found</h1>
          <p className="text-sand/60 mb-4">This collection doesn't exist or is private.</p>
          <Link to="/" className="text-lagoon hover:underline">Go to Home</Link>
        </div>
      </div>
    );
  }

  const { collection, tests } = data;

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
    if (!botUrl.trim()) return;
    localStorage.setItem("botUrl", botUrl);
    for (const test of tests) {
      setRunningIds((prev) => ({ ...prev, [test._id]: true }));
      try {
        const result = await runTest({ testId: test._id, url: botUrl });
        setResults((prev) => ({ ...prev, [test._id]: result }));
      } finally {
        setRunningIds((prev) => ({ ...prev, [test._id]: false }));
      }
    }
  };

  const passCount = tests.filter((t) => {
    const r = results[t._id];
    return r?.ok && t.expectedSafeMoves.includes(r.move ?? "");
  }).length;

  return (
    <div className="min-h-screen bg-night p-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link to="/" className="text-sand/60 hover:text-sand text-sm">&larr; Back to Home</Link>
          <h1 className="text-2xl font-bold text-sand mt-2">{collection.name}</h1>
          {collection.description && (
            <p className="text-sand/60 mt-1">{collection.description}</p>
          )}
          <p className="text-sand/40 text-sm mt-1">Created by {collection.ownerName}</p>
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
              disabled={!botUrl.trim() || tests.length === 0}
              className="bg-lagoon text-ink px-4 py-2 rounded hover:bg-lagoon/80 disabled:opacity-50"
            >
              Run All Tests
            </button>
          </div>
          {Object.keys(results).length > 0 && (
            <p className="text-sand/60 text-sm mt-2">
              Results: {passCount}/{tests.length} passed
            </p>
          )}
        </div>

        {tests.length === 0 ? (
          <p className="text-sand/60">This collection has no tests.</p>
        ) : (
          <div className="space-y-4">
            {tests.map((test) => {
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
                      <BoardPreview board={test.board} youId={test.youId} cellSize={20} />
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
