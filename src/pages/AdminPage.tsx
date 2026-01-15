import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import BoardPreview from "../components/BoardPreview";
import TestEditor from "../components/TestEditor";

type BannedAccount = {
  _id: Id<"bannedGoogleAccounts">;
  googleId: string;
  googleEmail: string;
  googleName?: string;
  reason?: string;
  bannedAt: number;
  bannedByUsername: string;
};

type UserRecord = {
  _id: Id<"users">;
  email: string;
  username: string;
  googleId?: string;
  googleName?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  createdAt: number;
  bannedFromPendingTests: boolean;
  bannedFromPublicCollections: boolean;
};

type Test = {
  _id: Id<"tests">;
  name: string;
  description?: string;
  board: Board;
  turn: number;
  youId: string;
  expectedSafeMoves: string[];
  status?: string;
  submitterName?: string;
  permaRejected?: boolean;
  rejectionReason?: string;
};

type Coordinate = { x: number; y: number };
type Snake = {
  id: string;
  name: string;
  health: number;
  body: Coordinate[];
  head: Coordinate;
  length: number;
  team?: string;
  isKing?: boolean;
  headEmoji?: string;
  latency?: string;
  shout?: string;
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

export default function AdminPage() {
  const { user, token, logout } = useAuth();
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});
  const [expandedTest, setExpandedTest] = useState<Id<"tests"> | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "public" | "rejected" | "private" | "users">("pending");
  const [editingTest, setEditingTest] = useState<Test | null>(null);
  const [banReason, setBanReason] = useState<Record<string, string>>({});
  const [editingRejectionReason, setEditingRejectionReason] = useState<Id<"tests"> | null>(null);
  const [editedRejectionReason, setEditedRejectionReason] = useState<string>("");
  const [userSearch, setUserSearch] = useState("");

  const pendingTests = useQuery(api.battlesnake.listPendingTests, token ? { token } : "skip");
  const publicTests = useQuery(api.battlesnake.listPublicTests);
  const rejectedTests = useQuery(api.battlesnake.listRejectedTests, token ? { token } : "skip");
  const privateTests = useQuery(api.battlesnake.listPrivateTests, token ? { token } : "skip");
  const approveTest = useMutation(api.battlesnake.approveTest);
  const rejectTest = useMutation(api.battlesnake.rejectTest);
  const permaRejectTest = useMutation(api.battlesnake.permaRejectTest);
  const makeTestPrivate = useMutation(api.battlesnake.makeTestPrivate);
  const adminUpdateTest = useMutation(api.battlesnake.adminUpdateTest);
  const updateRejectionReason = useMutation(api.battlesnake.updateRejectionReason);

  const allUsers = useQuery(api.auth.listAllUsers, token && user?.isSuperAdmin ? { token } : "skip") as UserRecord[] | undefined;
  const bannedAccounts = useQuery(api.auth.listBannedAccounts, token && user?.isSuperAdmin ? { token } : "skip") as BannedAccount[] | undefined;
  const banGoogleAccount = useMutation(api.auth.banGoogleAccount);
  const unbanGoogleAccount = useMutation(api.auth.unbanGoogleAccount);
  const toggleUserRestriction = useMutation(api.auth.toggleUserRestriction);

  const handleMakePrivate = async (id: Id<"tests">) => {
    if (!token) return;
    if (confirm("Are you sure you want to make this test private? It will be removed from the public list.")) {
      await makeTestPrivate({ token, id });
    }
  };

  const handleSaveTest = async (data: {
    name: string;
    board: Board;
    game?: Game;
    turn: number;
    youId: string;
    expectedSafeMoves: string[];
  }) => {
    if (!token || !editingTest) return;
    try {
      await adminUpdateTest({
        token,
        id: editingTest._id,
        ...data,
      });
      setEditingTest(null);
    } catch (error) {
      console.error("Error saving test:", error);
      alert(`Error saving test: ${error instanceof Error ? error.message : String(error)}`);
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

  const handlePermaReject = async (id: Id<"tests">) => {
    if (!confirm("Are you sure you want to permanently reject this test? The user will NOT be able to resubmit it.")) {
      return;
    }
    await permaRejectTest({ token, id, reason: rejectionReason[id] || undefined });
    setRejectionReason((prev) => {
      const newState = { ...prev };
      delete newState[id];
      return newState;
    });
  };

  const handleBanUser = async (userId: Id<"users">) => {
    if (!token) return;
    if (!confirm("Are you sure you want to ban this user's Google account? They will be logged out immediately and unable to sign in.")) {
      return;
    }
    const result = await banGoogleAccount({ token, targetUserId: userId, reason: banReason[userId] || undefined });
    if (!result.ok) {
      alert(result.error);
    } else {
      setBanReason((prev) => {
        const newState = { ...prev };
        delete newState[userId];
        return newState;
      });
    }
  };

  const handleToggleRestriction = async (userId: Id<"users">, restriction: "pendingTests" | "publicCollections") => {
    if (!token) return;
    const result = await toggleUserRestriction({ token, targetUserId: userId, restriction });
    if (!result.ok) {
      alert(result.error);
    }
  };

  const handleUnbanAccount = async (googleId: string) => {
    if (!token) return;
    if (!confirm("Are you sure you want to unban this Google account?")) {
      return;
    }
    const result = await unbanGoogleAccount({ token, googleId });
    if (!result.ok) {
      alert(result.error);
    }
  };

  const bannedGoogleIds = new Set(bannedAccounts?.map((b) => b.googleId) ?? []);
  const filteredUsers = allUsers?.filter((u) => {
    const search = userSearch.toLowerCase();
    return (
      u.email.toLowerCase().includes(search) ||
      u.username.toLowerCase().includes(search) ||
      (u.googleName?.toLowerCase().includes(search) ?? false)
    );
  });

  if (editingTest) {
    return (
      <div className="min-h-screen bg-night p-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold text-sand mb-4">Edit Test: {editingTest.name}</h1>
          <TestEditor
            initialData={editingTest}
            onSave={handleSaveTest}
            onCancel={() => setEditingTest(null)}
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
            <h1 className="text-2xl font-bold text-sand">Admin Panel</h1>
            <p className="text-sand/60">Manage all tests</p>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sand/60 hover:text-sand">Home</Link>
            <Link to="/dashboard" className="text-sand/60 hover:text-sand">Dashboard</Link>
            <button onClick={logout} className="text-sand/60 hover:text-sand">
              Log Out
            </button>
          </div>
        </header>

        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveTab("pending")}
            className={`px-4 py-2 rounded ${activeTab === "pending" ? "bg-lagoon text-ink" : "bg-sand/10 text-sand"}`}
          >
            Pending ({pendingTests?.length ?? 0})
          </button>
          <button
            onClick={() => setActiveTab("public")}
            className={`px-4 py-2 rounded ${activeTab === "public" ? "bg-moss text-ink" : "bg-sand/10 text-sand"}`}
          >
            Public ({publicTests?.length ?? 0})
          </button>
          <button
            onClick={() => setActiveTab("rejected")}
            className={`px-4 py-2 rounded ${activeTab === "rejected" ? "bg-ember text-ink" : "bg-sand/10 text-sand"}`}
          >
            Rejected ({rejectedTests?.length ?? 0})
          </button>
          <button
            onClick={() => setActiveTab("private")}
            className={`px-4 py-2 rounded ${activeTab === "private" ? "bg-clay text-ink" : "bg-sand/10 text-sand"}`}
          >
            Private ({privateTests?.length ?? 0})
          </button>
          {user?.isSuperAdmin && (
            <button
              onClick={() => setActiveTab("users")}
              className={`px-4 py-2 rounded ${activeTab === "users" ? "bg-purple-500 text-ink" : "bg-sand/10 text-sand"}`}
            >
              User Management
            </button>
          )}
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
                          onClick={() => setEditingTest(test)}
                          className="text-sm px-3 py-1 bg-lagoon text-ink rounded hover:bg-lagoon/80"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleApprove(test._id)}
                          className="text-sm px-3 py-1 bg-moss text-ink rounded hover:bg-moss/80"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                    {test.description && (
                      <p className="text-sand/70 text-sm mb-2">{test.description}</p>
                    )}
                    <p className="text-sand/60 text-sm mb-2">
                      Turn {test.turn} | Expected: {test.expectedSafeMoves.join(", ")} | Board: {test.board.width}x{test.board.height}
                      {test.submitterName && <span className="ml-2 text-lagoon">| Submitted by: {test.submitterName}</span>}
                    </p>

                    {expandedTest === test._id && (
                      <div className="my-4">
                        <BoardPreview board={test.board} youId={test.youId} cellSize={20} />
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
                      <button
                        onClick={() => handlePermaReject(test._id)}
                        className="text-sm px-3 py-1 bg-ember/60 text-ink rounded hover:bg-ember/40 border border-ember"
                        title="Permanently reject - user cannot resubmit"
                      >
                        Perma-reject
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
                          onClick={() => setEditingTest(test)}
                          className="text-sm px-3 py-1 bg-lagoon text-ink rounded hover:bg-lagoon/80"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleMakePrivate(test._id)}
                          className="text-sm px-3 py-1 bg-ember text-ink rounded hover:bg-ember/80"
                        >
                          Make Private
                        </button>
                      </div>
                    </div>
                    {test.description && (
                      <p className="text-sand/70 text-sm mb-2">{test.description}</p>
                    )}
                    <p className="text-sand/60 text-sm mb-2">
                      Turn {test.turn} | Expected: {test.expectedSafeMoves.join(", ")} | Board: {test.board.width}x{test.board.height}
                      {(test as Test & { submitterName?: string }).submitterName && <span className="ml-2 text-lagoon">| Submitted by: {(test as Test & { submitterName?: string }).submitterName}</span>}
                    </p>

                    {expandedTest === test._id && (
                      <div className="my-4">
                        <BoardPreview board={test.board} youId={test.youId} cellSize={20} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "rejected" && (
          <div>
            <h2 className="text-xl text-sand mb-4">Rejected Tests</h2>
            
            {rejectedTests === undefined ? (
              <p className="text-sand/60">Loading...</p>
            ) : rejectedTests.length === 0 ? (
              <p className="text-sand/60">No rejected tests.</p>
            ) : (
              <div className="space-y-4">
                {(rejectedTests as Test[]).map((test) => (
                  <div key={test._id} className="bg-ink border border-sand/20 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-sand">{test.name}</h3>
                        {test.permaRejected && (
                          <span className="px-2 py-0.5 text-xs rounded bg-ember/30 text-ember border border-ember/50">
                            Perma-rejected
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedTest(expandedTest === test._id ? null : test._id)}
                          className="text-sm px-3 py-1 bg-sand/10 text-sand rounded hover:bg-sand/20"
                        >
                          {expandedTest === test._id ? "Hide Board" : "Show Board"}
                        </button>
                        <button
                          onClick={() => setEditingTest(test)}
                          className="text-sm px-3 py-1 bg-lagoon text-ink rounded hover:bg-lagoon/80"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleApprove(test._id)}
                          className="text-sm px-3 py-1 bg-moss text-ink rounded hover:bg-moss/80"
                        >
                          Make Public
                        </button>
                      </div>
                    </div>
                    {test.description && (
                      <p className="text-sand/70 text-sm mb-2">{test.description}</p>
                    )}
                    <p className="text-sand/60 text-sm mb-2">
                      Turn {test.turn} | Expected: {test.expectedSafeMoves.join(", ")} | Board: {test.board.width}x{test.board.height}
                      {test.submitterName && <span className="ml-2 text-lagoon">| Submitted by: {test.submitterName}</span>}
                    </p>
                    {editingRejectionReason === test._id ? (
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={editedRejectionReason}
                          onChange={(e) => setEditedRejectionReason(e.target.value)}
                          placeholder="Rejection reason"
                          className="flex-1 bg-night border border-sand/20 rounded px-3 py-1 text-sand text-sm focus:outline-none focus:border-lagoon"
                        />
                        <button
                          onClick={async () => {
                            await updateRejectionReason({ token, id: test._id, reason: editedRejectionReason || undefined });
                            setEditingRejectionReason(null);
                            setEditedRejectionReason("");
                          }}
                          className="text-sm px-3 py-1 bg-moss text-ink rounded hover:bg-moss/80"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingRejectionReason(null);
                            setEditedRejectionReason("");
                          }}
                          className="text-sm px-3 py-1 bg-sand/10 text-sand rounded hover:bg-sand/20"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-ember text-sm">
                          Reason: {test.rejectionReason || <span className="text-sand/40 italic">No reason provided</span>}
                        </p>
                        <button
                          onClick={() => {
                            setEditingRejectionReason(test._id);
                            setEditedRejectionReason(test.rejectionReason || "");
                          }}
                          className="text-xs px-2 py-0.5 bg-sand/10 text-sand rounded hover:bg-sand/20"
                        >
                          Edit
                        </button>
                      </div>
                    )}

                    {expandedTest === test._id && (
                      <div className="my-4">
                        <BoardPreview board={test.board} youId={test.youId} cellSize={20} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "private" && (
          <div>
            <h2 className="text-xl text-sand mb-4">Private Tests</h2>
            
            {privateTests === undefined ? (
              <p className="text-sand/60">Loading...</p>
            ) : privateTests.length === 0 ? (
              <p className="text-sand/60">No private tests.</p>
            ) : (
              <div className="space-y-4">
                {(privateTests as Test[]).map((test) => (
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
                          onClick={() => setEditingTest(test)}
                          className="text-sm px-3 py-1 bg-lagoon text-ink rounded hover:bg-lagoon/80"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleApprove(test._id)}
                          className="text-sm px-3 py-1 bg-moss text-ink rounded hover:bg-moss/80"
                        >
                          Make Public
                        </button>
                      </div>
                    </div>
                    {test.description && (
                      <p className="text-sand/70 text-sm mb-2">{test.description}</p>
                    )}
                    <p className="text-sand/60 text-sm mb-2">
                      Turn {test.turn} | Expected: {test.expectedSafeMoves.join(", ")} | Board: {test.board.width}x{test.board.height}
                      {test.submitterName && <span className="ml-2 text-lagoon">| Submitted by: {test.submitterName}</span>}
                    </p>

                    {expandedTest === test._id && (
                      <div className="my-4">
                        <BoardPreview board={test.board} youId={test.youId} cellSize={20} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "users" && user?.isSuperAdmin && (
          <div>
            <h2 className="text-xl text-sand mb-4">User Management (Super Admin)</h2>
            
            <div className="mb-6">
              <h3 className="text-lg text-sand mb-3">Banned Google Accounts</h3>
              {bannedAccounts === undefined ? (
                <p className="text-sand/60">Loading...</p>
              ) : bannedAccounts.length === 0 ? (
                <p className="text-sand/60">No banned accounts.</p>
              ) : (
                <div className="space-y-2">
                  {bannedAccounts.map((ban) => (
                    <div key={ban._id} className="bg-ink border border-ember/30 rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sand font-medium">{ban.googleEmail}</p>
                        <p className="text-sand/60 text-sm">
                          {ban.googleName && <span>{ban.googleName} | </span>}
                          Banned by {ban.bannedByUsername} on {new Date(ban.bannedAt).toLocaleDateString()}
                        </p>
                        {ban.reason && <p className="text-ember text-sm mt-1">Reason: {ban.reason}</p>}
                      </div>
                      <button
                        onClick={() => handleUnbanAccount(ban.googleId)}
                        className="text-sm px-3 py-1 bg-moss text-ink rounded hover:bg-moss/80"
                      >
                        Unban
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-lg text-sand mb-3">All Users</h3>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by email, username, or name..."
                className="w-full max-w-md bg-ink border border-sand/20 rounded px-3 py-2 text-sand focus:outline-none focus:border-lagoon mb-4"
              />
              {filteredUsers === undefined ? (
                <p className="text-sand/60">Loading...</p>
              ) : filteredUsers.length === 0 ? (
                <p className="text-sand/60">No users found.</p>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map((u) => {
                    const isBanned = u.googleId ? bannedGoogleIds.has(u.googleId) : false;
                    return (
                      <div key={u._id} className={`bg-ink border rounded-lg p-3 ${isBanned ? "border-ember/50" : "border-sand/20"}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sand font-medium">{u.googleName ?? u.username}</p>
                              {u.isSuperAdmin && (
                                <span className="px-2 py-0.5 text-xs rounded bg-purple-500/20 text-purple-400">Super Admin</span>
                              )}
                              {u.isAdmin && !u.isSuperAdmin && (
                                <span className="px-2 py-0.5 text-xs rounded bg-lagoon/20 text-lagoon">Admin</span>
                              )}
                              {isBanned && (
                                <span className="px-2 py-0.5 text-xs rounded bg-ember/20 text-ember">Banned</span>
                              )}
                              {u.bannedFromPendingTests && (
                                <span className="px-2 py-0.5 text-xs rounded bg-orange-500/20 text-orange-400">No Pending Tests</span>
                              )}
                              {u.bannedFromPublicCollections && (
                                <span className="px-2 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400">No Public Collections</span>
                              )}
                            </div>
                            <p className="text-sand/60 text-sm">{u.email}</p>
                            {u.googleName && <p className="text-sand/40 text-sm">Google: {u.googleName}</p>}
                          </div>
                          <div className="flex flex-col gap-2 items-end">
                            {!u.isSuperAdmin && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleToggleRestriction(u._id, "pendingTests")}
                                  className={`text-xs px-2 py-1 rounded ${u.bannedFromPendingTests ? "bg-orange-500/30 text-orange-300 hover:bg-orange-500/50" : "bg-sand/10 text-sand/60 hover:bg-sand/20"}`}
                                  title={u.bannedFromPendingTests ? "Allow submitting pending tests" : "Ban from submitting pending tests"}
                                >
                                  {u.bannedFromPendingTests ? "Allow Pending" : "Ban Pending"}
                                </button>
                                <button
                                  onClick={() => handleToggleRestriction(u._id, "publicCollections")}
                                  className={`text-xs px-2 py-1 rounded ${u.bannedFromPublicCollections ? "bg-yellow-500/30 text-yellow-300 hover:bg-yellow-500/50" : "bg-sand/10 text-sand/60 hover:bg-sand/20"}`}
                                  title={u.bannedFromPublicCollections ? "Allow public collections" : "Ban from public collections"}
                                >
                                  {u.bannedFromPublicCollections ? "Allow Public" : "Ban Public"}
                                </button>
                              </div>
                            )}
                            {!u.isSuperAdmin && u.googleId && !isBanned && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={banReason[u._id] ?? ""}
                                  onChange={(e) => setBanReason({ ...banReason, [u._id]: e.target.value })}
                                  placeholder="Reason (optional)"
                                  className="w-40 bg-night border border-sand/20 rounded px-2 py-1 text-sand text-sm focus:outline-none focus:border-lagoon"
                                />
                                <button
                                  onClick={() => handleBanUser(u._id)}
                                  className="text-sm px-3 py-1 bg-ember text-ink rounded hover:bg-ember/80"
                                >
                                  Ban
                                </button>
                              </div>
                            )}
                            {!u.googleId && (
                              <span className="text-sand/40 text-sm">No Google account</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
