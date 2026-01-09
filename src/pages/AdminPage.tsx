import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type Test = {
  _id: Id<"tests">;
  name: string;
  board: Board;
  turn: number;
  youId: string;
  expectedSafeMoves: string[];
  status?: string;
};

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

const SNAKE_COLORS = ["#43b047", "#e55b3c", "#4285f4", "#f4b400", "#9c27b0", "#00bcd4"];

export default function AdminPage() {
  const { user, token, logout } = useAuth();
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});
  const [expandedTest, setExpandedTest] = useState<Id<"tests"> | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "public">("pending");

  const pendingTests = useQuery(api.battlesnake.listPendingTests, token ? { token } : "skip");
  const publicTests = useQuery(api.battlesnake.listPublicTests);
  const approveTest = useMutation(api.battlesnake.approveTest);
  const rejectTest = useMutation(api.battlesnake.rejectTest);

  const handleMakePrivate = async (id: Id<"tests">) => {
    if (!token) return;
    if (confirm("Are you sure you want to make this test private? It will be removed from the public list.")) {
      await rejectTest({ token, id, reason: "Made private by admin" });
    }
  };

  if (!user || !token) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center">
        <p className="text-sand">Please <Link to="/login" className="text-lagoon">log in</Link> to access the admin panel.</p>
      </div>
    );
  }

  if (!user.isAdmin) {
    return (
      <div className="min-h-screen bg-night flex items-center justify-center">
        <p className="text-sand">You don't have permission to access this page.</p>
      </div>
    );
  }

  const handleApprove = async (id: Id<"tests">) => {
    await approveTest({ token, id });
  };

  const handleReject = async (id: Id<"tests">) => {
    await rejectTest({ token, id, reason: rejectionReason[id] || undefined });
    setRejectionReason((prev) => {
      const newState = { ...prev };
      delete newState[id];
      return newState;
    });
  };

  const getCellContent = (board: Board, x: number, y: number, youId: string) => {
    for (let i = 0; i < board.snakes.length; i++) {
      const snake = board.snakes[i];
      if (snake.head.x === x && snake.head.y === y) {
        return { type: "head", color: SNAKE_COLORS[i % SNAKE_COLORS.length], isYou: snake.id === youId };
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

  return (
    <div className="min-h-screen bg-night p-4">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-sand">Admin Panel</h1>
            <p className="text-sand/60">Review and approve pending tests</p>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sand/60 hover:text-sand">Home</Link>
            <Link to="/dashboard" className="text-sand/60 hover:text-sand">Dashboard</Link>
            <button onClick={logout} className="text-sand/60 hover:text-sand">
              Log Out
            </button>
          </div>
        </header>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 rounded ${activeTab === "pending" ? "bg-lagoon text-ink" : "bg-sand/10 text-sand"}`}
          >
            Pending Tests ({pendingTests?.length ?? 0})
          </button>
          <button
            onClick={() => setActiveTab("public")}
            className={`px-4 py-2 rounded ${activeTab === "public" ? "bg-lagoon text-ink" : "bg-sand/10 text-sand"}`}
          >
            Public Tests ({publicTests?.length ?? 0})
          </button>
        </div>

        {activeTab === "pending" && (
          <div>
            <h2 className="text-xl text-sand mb-4">Pending Tests</h2>
            
            {pendingTests === undefined ? (
              <p className="text-sand/60">Loading...</p>
            ) : pendingTests.length === 0 ? (
              <p className="text-sand/60">No tests pending review.</p>
            ) : (
              <div className="space-y-4">
                {pendingTests.map((test) => (
                  <div key={test._id} className="bg-ink border border-sand/20 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold text-sand">{test.name}</h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedTest(expandedTest === test._id ? null : test._id)}
                          className="text-sm px-3 py-1 bg-sand/10 text-sand rounded hover:bg-sand/20"
                        >
                          {expandedTest === test._id ? "Hide Board" : "Show Board"}
                        </button>
                        <button
                          onClick={() => handleApprove(test._id)}
                          className="text-sm px-3 py-1 bg-moss text-ink rounded hover:bg-moss/80"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                    <p className="text-sand/60 text-sm mb-2">
                      Turn {test.turn} | Expected: {test.expectedSafeMoves.join(", ")} | Board: {test.board.width}x{test.board.height}
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
                                  className="w-5 h-5 rounded-sm border border-sand/10"
                                  style={{
                                    backgroundColor: content
                                      ? content.type === "food"
                                        ? "#e55b3c"
                                        : content.type === "hazard"
                                        ? "#6b21a8"
                                        : content.color
                                      : "#1a1a2e",
                                  }}
                                >
                                  {content?.type === "head" && (
                                    <span className="text-[8px] text-white flex items-center justify-center h-full">
                                      {content.isYou ? "Y" : ""}
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        value={rejectionReason[test._id] ?? ""}
                        onChange={(e) => setRejectionReason({ ...rejectionReason, [test._id]: e.target.value })}
                        placeholder="Rejection reason (optional)"
                        className="flex-1 bg-night border border-sand/20 rounded px-3 py-1 text-sand text-sm focus:outline-none focus:border-lagoon"
                      />
                      <button
                        onClick={() => handleReject(test._id)}
                        className="text-sm px-3 py-1 bg-ember text-ink rounded hover:bg-ember/80"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "public" && (
          <div>
            <h2 className="text-xl text-sand mb-4">Public Tests</h2>
            
            {publicTests === undefined ? (
              <p className="text-sand/60">Loading...</p>
            ) : publicTests.length === 0 ? (
              <p className="text-sand/60">No public tests available.</p>
            ) : (
              <div className="space-y-4">
                {(publicTests as Test[]).map((test) => (
                  <div key={test._id} className="bg-ink border border-sand/20 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-lg font-semibold text-sand">{test.name}</h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedTest(expandedTest === test._id ? null : test._id)}
                          className="text-sm px-3 py-1 bg-sand/10 text-sand rounded hover:bg-sand/20"
                        >
                          {expandedTest === test._id ? "Hide Board" : "Show Board"}
                        </button>
                        <button
                          onClick={() => handleMakePrivate(test._id)}
                          className="text-sm px-3 py-1 bg-ember text-ink rounded hover:bg-ember/80"
                        >
                          Make Private
                        </button>
                      </div>
                    </div>
                    <p className="text-sand/60 text-sm mb-2">
                      Turn {test.turn} | Expected: {test.expectedSafeMoves.join(", ")} | Board: {test.board.width}x{test.board.height}
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
                                  className="w-5 h-5 rounded-sm border border-sand/10"
                                  style={{
                                    backgroundColor: content
                                      ? content.type === "food"
                                        ? "#e55b3c"
                                        : content.type === "hazard"
                                        ? "#6b21a8"
                                        : content.color
                                      : "#1a1a2e",
                                  }}
                                >
                                  {content?.type === "head" && (
                                    <span className="text-[8px] text-white flex items-center justify-center h-full">
                                      {content.isYou ? "Y" : ""}
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
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
