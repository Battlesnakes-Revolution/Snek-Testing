import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../contexts/AuthContext";
import type { Id } from "../../convex/_generated/dataModel";
import BoardPreview from "../components/BoardPreview";
import { useAsyncTestRun } from "../hooks/useAsyncTestRun";

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
  description?: string;
  board: Board;
  turn: number;
  youId: string;
  expectedSafeMoves: string[];
};

export default function HomePage() {
  const { user, logout, token } = useAuth();
  const [botUrl, setBotUrl] = useState(() => localStorage.getItem("botUrl") ?? "");
  const [expandedTest, setExpandedTest] = useState<Id<"tests"> | null>(null);
  const [addingToCollection, setAddingToCollection] = useState<Id<"tests"> | null>(null);
  const { runTest, runAllTests, isRunning, getResult, runStates } = useAsyncTestRun(token);

  const publicTests = useQuery(api.battlesnake.listPublicTests);
  const collections = useQuery(
    api.battlesnake.listCollections,
    token ? { token } : "skip"
  );
  const addTestToCollection = useMutation(api.battlesnake.addTestToCollection);

  const handleRunTest = async (test: Test) => {
    if (!botUrl.trim()) return;
    localStorage.setItem("botUrl", botUrl);
    await runTest(test._id, botUrl);
  };

  const handleRunAll = async () => {
    if (!botUrl.trim() || !publicTests) return;
    localStorage.setItem("botUrl", botUrl);
    await runAllTests(publicTests as Array<{ _id: Id<"tests"> }>, botUrl);
  };

  const passCount = publicTests?.filter((t) => {
    const r = getResult(t._id);
    return r?.ok && t.expectedSafeMoves.includes(r.move ?? "");
  }).length ?? 0;

  const handleAddToCollection = async (collectionId: Id<"collections">) => {
    if (!token || !addingToCollection) return;
    try {
      await addTestToCollection({ token, collectionId, testId: addingToCollection });
      setAddingToCollection(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add test to collection");
    }
  };

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
              <Link to="/login" className="bg-lagoon text-ink px-4 py-2 rounded hover:bg-lagoon/80">
                Sign In
              </Link>
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
          {Object.keys(runStates).length > 0 && publicTests && (
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
                <Link to="/login" className="text-lagoon hover:underline">Sign in</Link> to submit your own tests for review.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {publicTests.map((test) => {
              const result = getResult(test._id);
              const running = isRunning(test._id);
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
                      {user && collections && collections.length > 0 && (
                        <button
                          onClick={() => setAddingToCollection(addingToCollection === test._id ? null : test._id)}
                          className="text-sm px-3 py-1 bg-moss/20 text-moss rounded hover:bg-moss/30"
                        >
                          + Collection
                        </button>
                      )}
                      <button
                        onClick={() => handleRunTest(test)}
                        disabled={running || !botUrl.trim()}
                        className="text-sm px-3 py-1 bg-lagoon text-ink rounded disabled:opacity-50"
                      >
                        {running ? "Running..." : "Run"}
                      </button>
                    </div>
                  </div>
                  {test.description && (
                    <p className="text-sand/70 text-sm mb-2">{test.description}</p>
                  )}
                  <p className="text-sand/60 text-sm">
                    Turn {test.turn} | Expected: {test.expectedSafeMoves.join(", ")}
                  </p>

                  {addingToCollection === test._id && collections && (
                    <div className="mt-2 p-2 bg-night rounded border border-sand/20">
                      <p className="text-sand/80 text-sm mb-2">Add to collection:</p>
                      <div className="flex flex-wrap gap-2">
                        {collections.map((col) => (
                          <button
                            key={col._id}
                            onClick={() => handleAddToCollection(col._id)}
                            className="text-sm px-3 py-1 bg-moss text-ink rounded hover:bg-moss/80"
                          >
                            {col.name}
                          </button>
                        ))}
                        <button
                          onClick={() => setAddingToCollection(null)}
                          className="text-sm px-3 py-1 bg-sand/10 text-sand rounded hover:bg-sand/20"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {expandedTest === test._id && (
                    <div className="my-4">
                      <BoardPreview board={test.board} youId={test.youId} cellSize={20} />
                    </div>
                  )}

                  {result && (
                    <div className={`mt-2 p-2 rounded text-sm ${passed ? "bg-moss/20 text-moss" : "bg-ember/20 text-ember"}`}>
                      {result.ok ? (
                        <span>
                          Move: {result.move} {passed ? "(PASS)" : "(FAIL)"}
                          {result.responseTimeMs !== undefined && (
                            <span className="ml-2 text-sand/60">| {result.responseTimeMs}ms</span>
                          )}
                        </span>
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
