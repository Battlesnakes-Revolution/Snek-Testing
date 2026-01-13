import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import TestEditor from "../components/TestEditor";
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
  latency?: string;
  shout?: string;
  squad?: string;
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

type Test = {
  _id: Id<"tests">;
  name: string;
  description?: string;
  board: Board;
  game?: Game;
  turn: number;
  youId: string;
  expectedSafeMoves: string[];
  status?: "pending" | "approved" | "rejected" | "private";
  rejectionReason?: string;
  permaRejected?: boolean;
};


export default function DashboardPage() {
  const { user, token, logout } = useAuth();
  const [view, setView] = useState<"tests" | "collections">("tests");
  const [showEditor, setShowEditor] = useState(false);
  const [editingTest, setEditingTest] = useState<Test | null>(null);
  const [botUrl, setBotUrl] = useState(() => localStorage.getItem("botUrl") ?? "");
  const { runTest, isRunning, getResult } = useAsyncTestRun(token);

  const myTests = useQuery(api.battlesnake.listMyTests, token ? { token } : "skip");
  const myCollections = useQuery(api.battlesnake.listCollections, token ? { token } : "skip");
  const createTest = useMutation(api.battlesnake.createUserTest);
  const updateTest = useMutation(api.battlesnake.updateUserTest);
  const deleteTest = useMutation(api.battlesnake.deleteUserTest);
  const resubmitTest = useMutation(api.battlesnake.resubmitTest);
  const createCollection = useMutation(api.battlesnake.createCollection);
  const updateCollection = useMutation(api.battlesnake.updateCollection);
  const deleteCollection = useMutation(api.battlesnake.deleteCollection);
  const addTestToCollection = useMutation(api.battlesnake.addTestToCollection);
  const removeTestFromCollection = useMutation(api.battlesnake.removeTestFromCollection);
  const regenerateSlug = useMutation(api.battlesnake.regenerateShareSlug);

  const [newCollectionName, setNewCollectionName] = useState("");
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [managingCollection, setManagingCollection] = useState<Id<"collections"> | null>(null);
  const [showBoardForTest, setShowBoardForTest] = useState<Set<string>>(new Set());

  const collectionTests = useQuery(
    api.battlesnake.getCollectionTests,
    managingCollection && token ? { token, collectionId: managingCollection } : "skip"
  );

  if (!user || !token) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center">
        <p className="text-sand">Please <Link to="/login" className="text-lagoon">log in</Link> to view your dashboard.</p>
      </div>
    );
  }

  const handleSaveTest = async (data: {
    name: string;
    board: Board;
    game?: Game;
    turn: number;
    youId: string;
    expectedSafeMoves: string[];
    makePrivate?: boolean;
  }) => {
    try {
      const { makePrivate, ...testData } = data;
      if (editingTest) {
        await updateTest({
          token,
          id: editingTest._id,
          ...testData,
        });
      } else {
        await createTest({
          token,
          ...testData,
          makePrivate,
        });
      }
      setShowEditor(false);
      setEditingTest(null);
    } catch (error) {
      console.error("Error saving test:", error);
      alert(`Error saving test: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDeleteTest = async (id: Id<"tests">) => {
    if (confirm("Are you sure you want to delete this test?")) {
      await deleteTest({ token, id });
    }
  };

  const handleRunTest = async (test: Test) => {
    if (!botUrl.trim()) return;
    localStorage.setItem("botUrl", botUrl);
    await runTest(test._id, botUrl);
  };

  const handleRunAllTests = async () => {
    if (!botUrl.trim() || !myTests?.length) return;
    localStorage.setItem("botUrl", botUrl);
    for (const test of myTests) {
      await runTest(test._id, botUrl);
    }
  };

  const anyTestRunning = myTests?.some((t) => isRunning(t._id)) ?? false;

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;
    await createCollection({ token, name: newCollectionName, isPublic: false });
    setNewCollectionName("");
    setShowNewCollection(false);
  };

  const handleDeleteCollection = async (id: Id<"collections">) => {
    if (confirm("Are you sure you want to delete this collection?")) {
      await deleteCollection({ token, id });
    }
  };

  const handleTogglePublic = async (collection: { _id: Id<"collections">; name: string; isPublic: boolean; description?: string }) => {
    await updateCollection({
      token,
      id: collection._id,
      name: collection.name,
      description: collection.description,
      isPublic: !collection.isPublic,
    });
  };

  const handleRegenerateSlug = async (id: Id<"collections">) => {
    await regenerateSlug({ token, id });
  };

  const handleAddToCollection = async (testId: Id<"tests">) => {
    if (!managingCollection) return;
    try {
      await addTestToCollection({ token, collectionId: managingCollection, testId });
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleRemoveFromCollection = async (testId: Id<"tests">) => {
    if (!managingCollection) return;
    await removeTestFromCollection({ token, collectionId: managingCollection, testId });
  };

  const handleResubmit = async (id: Id<"tests">) => {
    try {
      await resubmitTest({ token, id });
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const getStatusBadge = (status?: string, permaRejected?: boolean) => {
    switch (status) {
      case "approved":
        return <span className="px-2 py-0.5 text-xs rounded bg-moss/20 text-moss">Approved</span>;
      case "pending":
        return <span className="px-2 py-0.5 text-xs rounded bg-clay/20 text-clay">Pending Review</span>;
      case "rejected":
        return permaRejected 
          ? <span className="px-2 py-0.5 text-xs rounded bg-ember/30 text-ember border border-ember/50">Perma-rejected</span>
          : <span className="px-2 py-0.5 text-xs rounded bg-ember/20 text-ember">Rejected</span>;
      default:
        return null;
    }
  };

  if (showEditor) {
    return (
      <div className="min-h-screen bg-night p-4">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => { setShowEditor(false); setEditingTest(null); }}
            className="text-sand/60 hover:text-sand mb-4"
          >
            &larr; Back to Dashboard
          </button>
          <TestEditor
            initialData={editingTest}
            onSave={handleSaveTest}
            onCancel={() => { setShowEditor(false); setEditingTest(null); }}
            showMakePrivate={!editingTest}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-night p-4">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-sand">Dashboard</h1>
            <p className="text-sand/60">Welcome, {user.googleName ?? user.username}</p>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sand/60 hover:text-sand">Home</Link>
            {user.isAdmin && (
              <Link to="/admin" className="text-lagoon hover:underline">Admin</Link>
            )}
            <button onClick={logout} className="text-sand/60 hover:text-sand">
              Log Out
            </button>
          </div>
        </header>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setView("tests")}
            className={`px-4 py-2 rounded ${view === "tests" ? "bg-lagoon text-ink" : "bg-ink text-sand border border-sand/20"}`}
          >
            My Tests
          </button>
          <button
            onClick={() => setView("collections")}
            className={`px-4 py-2 rounded ${view === "collections" ? "bg-lagoon text-ink" : "bg-ink text-sand border border-sand/20"}`}
          >
            My Collections
          </button>
        </div>

        {view === "tests" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-sand">My Tests</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunAllTests}
                  disabled={anyTestRunning || !botUrl.trim() || !myTests?.length}
                  className="bg-moss text-ink px-4 py-2 rounded hover:bg-moss/80 disabled:opacity-50"
                >
                  {anyTestRunning ? "Running..." : "Run All Tests"}
                </button>
                <button
                  onClick={() => setShowEditor(true)}
                  className="bg-lagoon text-ink px-4 py-2 rounded hover:bg-lagoon/80"
                >
                  Create New Test
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sand/80 text-sm mb-1">Bot URL (for testing)</label>
              <input
                type="text"
                value={botUrl}
                onChange={(e) => setBotUrl(e.target.value)}
                placeholder="https://your-battlesnake.com"
                className="w-full max-w-md bg-ink border border-sand/20 rounded px-3 py-2 text-sand focus:outline-none focus:border-lagoon"
              />
            </div>

            {myTests === undefined ? (
              <p className="text-sand/60">Loading...</p>
            ) : myTests.length === 0 ? (
              <p className="text-sand/60">You haven't created any tests yet.</p>
            ) : (
              <div className="space-y-4">
                {myTests.map((test) => {
                  const result = getResult(test._id);
                  const running = isRunning(test._id);
                  const passed = result?.ok && test.expectedSafeMoves.includes(result.move ?? "");
                  return (
                    <div key={test._id} className="bg-ink border border-sand/20 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold text-sand">{test.name}</h3>
                          {getStatusBadge(test.status, test.permaRejected)}
                        </div>
                        <div className="flex items-center gap-2">
                          {test.status === "rejected" && !test.permaRejected && (
                            <button
                              onClick={() => handleResubmit(test._id)}
                              className="text-sm px-3 py-1 bg-moss text-ink rounded hover:bg-moss/80"
                            >
                              Resubmit
                            </button>
                          )}
                          <button
                            onClick={() => handleRunTest(test)}
                            disabled={running || !botUrl.trim()}
                            className="text-sm px-3 py-1 bg-lagoon text-ink rounded disabled:opacity-50"
                          >
                            {running ? "Running..." : "Run Test"}
                          </button>
                          {!test.permaRejected && (
                            <button
                              onClick={() => { setEditingTest(test); setShowEditor(true); }}
                              className="text-sm px-3 py-1 bg-sand/10 text-sand rounded hover:bg-sand/20"
                            >
                              Edit
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteTest(test._id)}
                            className="text-sm px-3 py-1 bg-ember/20 text-ember rounded hover:bg-ember/30"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {test.description && (
                        <p className="text-sand/70 text-sm mb-1">{test.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sand/60 text-sm">
                        <span>Turn {test.turn} | Expected: {test.expectedSafeMoves.join(", ")}</span>
                        <button
                          onClick={() => {
                            const next = new Set(showBoardForTest);
                            if (next.has(test._id)) {
                              next.delete(test._id);
                            } else {
                              next.add(test._id);
                            }
                            setShowBoardForTest(next);
                          }}
                          className="text-lagoon hover:underline text-sm"
                        >
                          {showBoardForTest.has(test._id) ? "Hide Board" : "Show Board"}
                        </button>
                      </div>
                      {showBoardForTest.has(test._id) && (
                        <div className="mt-3">
                          <BoardPreview board={test.board} youId={test.youId} cellSize={24} />
                        </div>
                      )}
                      {test.status === "rejected" && test.rejectionReason && (
                        <p className="text-ember text-sm mt-2">
                          Rejection reason: {test.rejectionReason}
                          {test.permaRejected && <span className="ml-2">(Cannot be resubmitted)</span>}
                        </p>
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
        )}

        {view === "collections" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-sand">My Collections</h2>
              <button
                onClick={() => setShowNewCollection(true)}
                className="bg-lagoon text-ink px-4 py-2 rounded hover:bg-lagoon/80"
              >
                Create Collection
              </button>
            </div>

            {showNewCollection && (
              <div className="bg-ink border border-sand/20 rounded-lg p-4 mb-4">
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Collection name"
                  className="w-full bg-night border border-sand/20 rounded px-3 py-2 text-sand focus:outline-none focus:border-lagoon mb-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateCollection}
                    className="bg-lagoon text-ink px-4 py-2 rounded hover:bg-lagoon/80"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowNewCollection(false)}
                    className="bg-sand/10 text-sand px-4 py-2 rounded hover:bg-sand/20"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {myCollections === undefined ? (
              <p className="text-sand/60">Loading...</p>
            ) : myCollections.length === 0 ? (
              <p className="text-sand/60">You haven't created any collections yet.</p>
            ) : (
              <div className="space-y-4">
                {myCollections.map((collection) => (
                  <div key={collection._id} className="bg-ink border border-sand/20 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-sand">{collection.name}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded ${collection.isPublic ? "bg-moss/20 text-moss" : "bg-sand/20 text-sand/60"}`}>
                          {collection.isPublic ? "Public" : "Private"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setManagingCollection(managingCollection === collection._id ? null : collection._id)}
                          className="text-sm px-3 py-1 bg-sand/10 text-sand rounded hover:bg-sand/20"
                        >
                          {managingCollection === collection._id ? "Close" : "Manage Tests"}
                        </button>
                        <button
                          onClick={() => handleTogglePublic(collection)}
                          className="text-sm px-3 py-1 bg-sand/10 text-sand rounded hover:bg-sand/20"
                        >
                          Make {collection.isPublic ? "Private" : "Public"}
                        </button>
                        <button
                          onClick={() => handleDeleteCollection(collection._id)}
                          className="text-sm px-3 py-1 bg-ember/20 text-ember rounded hover:bg-ember/30"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {collection.isPublic && (
                      <div className="flex items-center gap-2 text-sm text-sand/60">
                        <span>Share link: /c/{collection.shareSlug}</span>
                        <button
                          onClick={() => handleRegenerateSlug(collection._id)}
                          className="text-lagoon hover:underline"
                        >
                          Regenerate
                        </button>
                        <button
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/c/${collection.shareSlug}`)}
                          className="text-lagoon hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    )}

                    {managingCollection === collection._id && (
                      <div className="mt-4 border-t border-sand/20 pt-4">
                        <h4 className="text-sand font-semibold mb-2">Tests in Collection</h4>
                        {collectionTests === undefined ? (
                          <p className="text-sand/60 text-sm">Loading...</p>
                        ) : collectionTests.length === 0 ? (
                          <p className="text-sand/60 text-sm">No tests in this collection.</p>
                        ) : (
                          <div className="space-y-2 mb-4">
                            {collectionTests.map((test) => (
                              <div key={test._id} className="flex items-center justify-between bg-night/50 p-2 rounded">
                                <span className="text-sand">{test.name}</span>
                                <button
                                  onClick={() => handleRemoveFromCollection(test._id)}
                                  className="text-sm text-ember hover:underline"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <h4 className="text-sand font-semibold mb-2">Add Tests</h4>
                        {myTests?.filter((t) => !collectionTests?.some((ct) => ct._id === t._id)).map((test) => (
                          <div key={test._id} className="flex items-center justify-between bg-night/50 p-2 rounded mb-1">
                            <span className="text-sand">{test.name}</span>
                            <button
                              onClick={() => handleAddToCollection(test._id)}
                              className="text-sm text-lagoon hover:underline"
                            >
                              Add
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
