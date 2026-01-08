import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

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
  _creationTime: number;
  name: string;
  board: Board;
  game?: Game;
  turn: number;
  youId: string;
  expectedSafeMoves: string[];
};
type RunResult = {
  ok: boolean;
  move?: string | null;
  shout?: string | null;
  error?: string;
  status?: number;
  raw?: unknown;
};

type EditableSnake = {
  id: string;
  name: string;
  health: number;
  squad: string;
  head?: Coordinate;
  body: Coordinate[];
};
type EditorState = {
  name: string;
  turn: number;
  expectedSafeMoves: string;
  width: number;
  height: number;
  food: Coordinate[];
  hazards: Coordinate[];
  snakes: EditableSnake[];
  youId: string;
};
type EditorStateSetter = Dispatch<SetStateAction<EditorState>>;

type PlacementMode = "food" | "hazard" | "erase" | "snakeHead" | "snakeBody";

const FALLBACK_SQUAD_COLORS = [
  "#0ea5e9",
  "#f97316",
  "#84cc16",
  "#ef4444",
  "#14b8a6",
  "#eab308",
];

const DEFAULT_EDITOR_STATE: EditorState = {
  name: "",
  turn: 0,
  expectedSafeMoves: "up, right",
  width: 11,
  height: 11,
  food: [{ x: 2, y: 8 }],
  hazards: [{ x: 0, y: 0 }],
  snakes: [
    {
      id: "snake-a",
      name: "Alpha",
      health: 90,
      squad: "alpha",
      head: { x: 5, y: 5 },
      body: [{ x: 5, y: 5 }],
    },
  ],
  youId: "snake-a",
};

const ADMIN_TOKEN_KEY = "adminToken";
const ADMIN_CLIENT_ID_KEY = "adminClientId";

function getClientId() {
  const existing = window.localStorage.getItem(ADMIN_CLIENT_ID_KEY);
  if (existing) {
    return existing;
  }
  const next = `client-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(ADMIN_CLIENT_ID_KEY, next);
  return next;
}

export default function App() {
  const tests = useQuery(api.battlesnake.listTests);
  const runTest = useAction(api.battlesnake.runTest);
  const createTest = useMutation(api.battlesnake.createTest);
  const updateTest = useMutation(api.battlesnake.updateTest);
  const deleteTest = useMutation(api.battlesnake.deleteTest);
  const verifyAdminPassword = useMutation(api.battlesnake.verifyAdminPassword);
  const isAdminRoute = typeof window !== "undefined"
    ? window.location.pathname.startsWith("/admin")
    : false;

  const [botUrl, setBotUrl] = useState(
    () => window.localStorage.getItem("botUrl") ?? "",
  );
  const [runError, setRunError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [runningIds, setRunningIds] = useState<Record<string, boolean>>({});

  const [adminToken, setAdminToken] = useState(
    () => window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "",
  );
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [editorState, setEditorState] = useState<EditorState>(
    DEFAULT_EDITOR_STATE,
  );
  const [activeSnakeId, setActiveSnakeId] = useState(
    DEFAULT_EDITOR_STATE.snakes[0].id,
  );
  const [placementMode, setPlacementMode] = useState<PlacementMode>("food");
  const [editingTestId, setEditingTestId] = useState<Id<"tests"> | null>(null);

  const clientId = useMemo(() => {
    if (typeof window === "undefined") {
      return "server";
    }
    return getClientId();
  }, []);

  const adminSession = useQuery(
    api.battlesnake.validateAdminSession,
    adminToken ? { token: adminToken } : "skip",
  );
  const isAdminSessionLoading = Boolean(adminToken && adminSession === undefined);

  const sortedTests = useMemo<Test[]>(() => {
    const items = (tests ?? []) as Test[];
    return items.slice().sort((a, b) => b._creationTime - a._creationTime);
  }, [tests]);

  const handleRunAll = async () => {
    if (!botUrl.trim()) {
      setRunError("Add a bot URL before running tests.");
      return;
    }
    setRunError(null);
    const targetTests = sortedTests;
    await Promise.all(
      targetTests.map(async (testItem) => {
        setRunningIds((prev) => ({ ...prev, [testItem._id]: true }));
        const result = await runTest({
          testId: testItem._id,
          url: botUrl,
        });
        setResults((prev) => ({ ...prev, [testItem._id]: result }));
        setRunningIds((prev) => ({ ...prev, [testItem._id]: false }));
      }),
    );
  };

  const handleRunSingle = async (testItem: Test) => {
    if (!botUrl.trim()) {
      setRunError("Add a bot URL before running tests.");
      return;
    }
    setRunError(null);
    setRunningIds((prev) => ({ ...prev, [testItem._id]: true }));
    const result = await runTest({ testId: testItem._id, url: botUrl });
    setResults((prev) => ({ ...prev, [testItem._id]: result }));
    setRunningIds((prev) => ({ ...prev, [testItem._id]: false }));
  };

  const handleAdminLogin = async () => {
    setAdminError(null);
    setIsAuthenticating(true);
    try {
      const result = await verifyAdminPassword({
        password: adminPassword,
        clientId,
      });
      if (!result.ok || !result.token) {
        setAdminError(result.error ?? "Login failed.");
        return;
      }
      setAdminToken(result.token);
      window.localStorage.setItem(ADMIN_TOKEN_KEY, result.token);
      setAdminPassword("");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    setAdminToken("");
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
  };

  const normalizeEditorState = (state: EditorState): {
    name: string;
    turn: number;
    expectedSafeMoves: string[];
    board: Board;
    youId: string;
  } => {
    const expectedSafeMoves = state.expectedSafeMoves
      .split(",")
      .map((move) => move.trim().toLowerCase())
      .filter(Boolean);

    const normalizedSnakes: Snake[] = state.snakes.map((snakeItem) => {
      const head = snakeItem.head ?? snakeItem.body[0];
      if (!head) {
        throw new Error(`Snake ${snakeItem.name} is missing a head.`);
      }
      const body = snakeItem.body.length ? snakeItem.body : [head];
      return {
        id: snakeItem.id,
        name: snakeItem.name,
        health: snakeItem.health,
        head,
        body,
        length: body.length,
        squad: snakeItem.squad || undefined,
      };
    });

    const board: Board = {
      height: state.height,
      width: state.width,
      food: state.food,
      hazards: state.hazards,
      snakes: normalizedSnakes,
    };

    const youId =
      state.snakes.find((snakeItem) => snakeItem.id === state.youId)?.id ??
      normalizedSnakes[0]?.id;
    if (!youId) {
      throw new Error("Add at least one snake to the board.");
    }

    return {
      name: state.name || `Test ${new Date().toISOString()}`,
      turn: state.turn,
      expectedSafeMoves,
      board,
      youId,
    };
  };

  const handleSaveTest = async () => {
    setAdminError(null);
    if (!adminToken) {
      setAdminError("Sign in to save tests.");
      return;
    }
    try {
      const normalized = normalizeEditorState(editorState);
      if (editingTestId) {
        const updated = await updateTest({
          adminToken,
          id: editingTestId,
          name: normalized.name,
          board: normalized.board,
          game: undefined,
          turn: normalized.turn,
          youId: normalized.youId,
          expectedSafeMoves: normalized.expectedSafeMoves,
        });
        if (updated) {
          handleLoadTest(updated as Test);
        }
      } else {
        const created = await createTest({
          adminToken,
          name: normalized.name,
          board: normalized.board,
          game: undefined,
          turn: normalized.turn,
          youId: normalized.youId,
          expectedSafeMoves: normalized.expectedSafeMoves,
        });
        if (created) {
          handleLoadTest(created as Test);
        }
      }
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Save failed.");
    }
  };

  const handleDelete = async (testId: Id<"tests">) => {
    setAdminError(null);
    if (!adminToken) {
      setAdminError("Sign in to delete tests.");
      return;
    }
    try {
      await deleteTest({ adminToken, id: testId });
      if (editingTestId === testId) {
        setEditingTestId(null);
      }
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Delete failed.");
    }
  };

  const handleLoadTest = (testItem: Test) => {
    setEditingTestId(testItem._id);
    setEditorState({
      name: testItem.name,
      turn: testItem.turn,
      expectedSafeMoves: testItem.expectedSafeMoves.join(", "),
      width: testItem.board.width,
      height: testItem.board.height,
      food: testItem.board.food,
      hazards: testItem.board.hazards,
      snakes: testItem.board.snakes.map((snakeItem) => ({
        id: snakeItem.id,
        name: snakeItem.name,
        health: snakeItem.health,
        squad: snakeItem.squad ?? "",
        head: snakeItem.head,
        body: snakeItem.body,
      })),
      youId: testItem.youId,
    });
    setActiveSnakeId(testItem.youId);
  };

  const handleNewTest = () => {
    setEditingTestId(null);
    setEditorState(DEFAULT_EDITOR_STATE);
    setActiveSnakeId(DEFAULT_EDITOR_STATE.snakes[0].id);
    setPlacementMode("food");
  };

  return (
    <div className="min-h-screen">
      {isAdminRoute ? (
        <AdminPanel
          sortedTests={sortedTests}
          adminSession={adminSession}
          isAdminSessionLoading={isAdminSessionLoading}
          adminPassword={adminPassword}
          setAdminPassword={setAdminPassword}
          adminError={adminError}
          isAuthenticating={isAuthenticating}
          onLogin={handleAdminLogin}
          onLogout={handleLogout}
          editorState={editorState}
          setEditorState={setEditorState}
          placementMode={placementMode}
          setPlacementMode={setPlacementMode}
          activeSnakeId={activeSnakeId}
          setActiveSnakeId={setActiveSnakeId}
          editingTestId={editingTestId}
          onNew={handleNewTest}
          onSave={handleSaveTest}
          onDelete={handleDelete}
          onLoadTest={handleLoadTest}
        />
      ) : (
        <MainPanel
          botUrl={botUrl}
          setBotUrl={setBotUrl}
          runError={runError}
          sortedTests={sortedTests}
          results={results}
          runningIds={runningIds}
          onRunAll={handleRunAll}
          onRunSingle={handleRunSingle}
        />
      )}
    </div>
  );
}

function MainPanel({
  botUrl,
  setBotUrl,
  runError,
  sortedTests,
  results,
  runningIds,
  onRunAll,
  onRunSingle,
}: {
  botUrl: string;
  setBotUrl: (value: string) => void;
  runError: string | null;
  sortedTests: Test[];
  results: Record<string, RunResult>;
  runningIds: Record<string, boolean>;
  onRunAll: () => void;
  onRunSingle: (testItem: Test) => void;
}) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <p className="text-sm uppercase tracking-[0.4em] text-slate-500">
          Battlesnake Test Bench
        </p>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900">
              One-turn survival drills.
            </h1>
            <p className="text-slate-600 max-w-xl mt-2">
              Paste your Battlesnake URL, run every scenario, and see which
              moves pass the survival window you define.
            </p>
          </div>
          <div className="bg-white/80 border border-slate-200 shadow-sm rounded-2xl p-4 flex flex-col gap-3 w-full md:w-[360px]">
            <label className="text-xs uppercase tracking-[0.3em] text-slate-500">
              Bot URL
            </label>
            <input
              value={botUrl}
              onChange={(event) => {
                const value = event.target.value;
                setBotUrl(value);
                window.localStorage.setItem("botUrl", value);
              }}
              placeholder="https://your-snake.dev"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <button
              onClick={() => void onRunAll()}
              className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 transition"
            >
              Run all tests
            </button>
            {runError ? <p className="text-xs text-red-600">{runError}</p> : null}
          </div>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {sortedTests.length === 0 ? (
          <div className="col-span-full bg-white/80 border border-slate-200 rounded-2xl p-6 text-slate-600">
            No tests yet. Add one at /admin.
          </div>
        ) : null}
        {sortedTests.map((testItem) => (
          <TestCard
            key={testItem._id}
            testItem={testItem}
            result={results[testItem._id]}
            isRunning={Boolean(runningIds[testItem._id])}
            onRun={() => void onRunSingle(testItem)}
          />
        ))}
      </section>
    </main>
  );
}

function AdminPanel({
  sortedTests,
  adminSession,
  isAdminSessionLoading,
  adminPassword,
  setAdminPassword,
  adminError,
  isAuthenticating,
  onLogin,
  onLogout,
  editorState,
  setEditorState,
  placementMode,
  setPlacementMode,
  activeSnakeId,
  setActiveSnakeId,
  editingTestId,
  onNew,
  onSave,
  onDelete,
  onLoadTest,
}: {
  sortedTests: Test[];
  adminSession:
    | { ok: boolean; expiresAt?: number; error?: string }
    | undefined
    | null;
  isAdminSessionLoading: boolean;
  adminPassword: string;
  setAdminPassword: (value: string) => void;
  adminError: string | null;
  isAuthenticating: boolean;
  onLogin: () => void;
  onLogout: () => void;
  editorState: EditorState;
  setEditorState: EditorStateSetter;
  placementMode: PlacementMode;
  setPlacementMode: (mode: PlacementMode) => void;
  activeSnakeId: string;
  setActiveSnakeId: (value: string) => void;
  editingTestId: Id<"tests"> | null;
  onNew: () => void;
  onSave: () => void;
  onDelete: (testId: Id<"tests">) => void;
  onLoadTest: (testItem: Test) => void;
}) {
  const isAuthed = Boolean(adminSession && adminSession.ok);

  if (isAdminSessionLoading) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 flex flex-col gap-4">
        <p className="text-sm text-slate-600">Checking admin session...</p>
      </main>
    );
  }

  if (!isAuthed) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 flex flex-col gap-6">
        <header>
          <p className="text-sm uppercase tracking-[0.4em] text-slate-500">
            Admin Console
          </p>
          <h1 className="text-3xl font-semibold text-slate-900 mt-2">
            Sign in to edit tests
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Enter the admin password to unlock the GUI editor.
          </p>
        </header>
        <div className="bg-white/90 border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
          <label className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Admin password
          </label>
          <input
            type="password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            placeholder="Secret passphrase"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            onClick={() => void onLogin()}
            disabled={isAuthenticating}
            className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-60"
          >
            {isAuthenticating ? "Checking..." : "Unlock editor"}
          </button>
          {adminError ? <p className="text-xs text-red-600">{adminError}</p> : null}
          {adminSession?.error ? (
            <p className="text-xs text-red-600">{adminSession.error}</p>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-[0.4em] text-slate-500">
          Admin Console
        </p>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900">
              Build Battlesnake tests visually.
            </h1>
            <p className="text-sm text-slate-600 max-w-2xl mt-2">
              Click the grid to place snakes, food, or hazards. Assign squads to
              group teams. Load existing tests to edit them.
            </p>
          </div>
          <button
            onClick={onLogout}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <EditorControls
          editorState={editorState}
          setEditorState={setEditorState}
          placementMode={placementMode}
          setPlacementMode={setPlacementMode}
          activeSnakeId={activeSnakeId}
          setActiveSnakeId={setActiveSnakeId}
          onSave={onSave}
          onNew={onNew}
          editingTestId={editingTestId}
          adminError={adminError}
        />
        <BoardEditor
          editorState={editorState}
          setEditorState={setEditorState}
          placementMode={placementMode}
          activeSnakeId={activeSnakeId}
        />
      </section>

      <section className="bg-white/80 border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Existing tests</h2>
        {sortedTests.length === 0 ? (
          <p className="text-sm text-slate-600 mt-2">
            No tests saved yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 mt-3">
            {sortedTests.map((testItem) => (
              <div
                key={testItem._id}
                className="flex items-center gap-2 border border-slate-200 rounded-full px-3 py-1"
              >
                <button
                  onClick={() => onLoadTest(testItem)}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                >
                  Load {testItem.name}
                </button>
                <button
                  onClick={() => void onDelete(testItem._id)}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function EditorControls({
  editorState,
  setEditorState,
  placementMode,
  setPlacementMode,
  activeSnakeId,
  setActiveSnakeId,
  onNew,
  onSave,
  editingTestId,
  adminError,
}: {
  editorState: EditorState;
  setEditorState: EditorStateSetter;
  placementMode: PlacementMode;
  setPlacementMode: (mode: PlacementMode) => void;
  activeSnakeId: string;
  setActiveSnakeId: (value: string) => void;
  onNew: () => void;
  onSave: () => void;
  editingTestId: Id<"tests"> | null;
  adminError: string | null;
}) {
  const activeSnake = editorState.snakes.find(
    (snakeItem) => snakeItem.id === activeSnakeId,
  );

  const updateSnake = (id: string, updater: (snake: EditableSnake) => EditableSnake) => {
    setEditorState({
      ...editorState,
      snakes: editorState.snakes.map((snakeItem) =>
        snakeItem.id === id ? updater(snakeItem) : snakeItem,
      ),
    });
  };

  const addSnake = () => {
    const index = editorState.snakes.length + 1;
    const newSnake: EditableSnake = {
      id: `snake-${index}`,
      name: `Snake ${index}`,
      health: 100,
      squad: "",
      body: [],
    };
    setEditorState({
      ...editorState,
      snakes: [...editorState.snakes, newSnake],
      youId: editorState.youId || newSnake.id,
    });
    setActiveSnakeId(newSnake.id);
  };

  const removeSnake = (id: string) => {
    const nextSnakes = editorState.snakes.filter((snakeItem) => snakeItem.id !== id);
    setEditorState({
      ...editorState,
      snakes: nextSnakes,
      youId: nextSnakes[0]?.id ?? "",
    });
    if (activeSnakeId === id && nextSnakes[0]) {
      setActiveSnakeId(nextSnakes[0].id);
    }
  };

  const updateBoardSize = (dimension: "width" | "height", value: number) => {
    const nextValue = Math.max(3, Math.min(25, value));
    const nextState = {
      ...editorState,
      [dimension]: nextValue,
    } as EditorState;
    const inBounds = (coord: Coordinate) =>
      coord.x >= 0 && coord.y >= 0 && coord.x < nextState.width && coord.y < nextState.height;

    nextState.food = nextState.food.filter(inBounds);
    nextState.hazards = nextState.hazards.filter(inBounds);
    nextState.snakes = nextState.snakes.map((snakeItem) => ({
      ...snakeItem,
      head: snakeItem.head && inBounds(snakeItem.head) ? snakeItem.head : undefined,
      body: snakeItem.body.filter(inBounds),
    }));
    setEditorState(nextState);
  };

  return (
    <aside className="bg-white/80 border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Test settings</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onNew}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
          >
            New
          </button>
          <button
            onClick={onSave}
            className="rounded-xl bg-orange-500 text-white px-3 py-1.5 text-xs font-semibold hover:bg-orange-400"
          >
            {editingTestId ? "Update test" : "Save test"}
          </button>
        </div>
      </div>
      {adminError ? <p className="text-xs text-red-600">{adminError}</p> : null}

      <label className="text-xs uppercase tracking-[0.3em] text-slate-500">Name</label>
      <input
        value={editorState.name}
        onChange={(event) =>
          setEditorState({ ...editorState, name: event.target.value })
        }
        placeholder="e.g. corner squeeze"
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Width
          </label>
          <input
            type="number"
            value={editorState.width}
            min={3}
            max={25}
            onChange={(event) =>
              updateBoardSize("width", Number(event.target.value))
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Height
          </label>
          <input
            type="number"
            value={editorState.height}
            min={3}
            max={25}
            onChange={(event) =>
              updateBoardSize("height", Number(event.target.value))
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <label className="text-xs uppercase tracking-[0.3em] text-slate-500">Turn</label>
      <input
        type="number"
        value={editorState.turn}
        min={0}
        onChange={(event) =>
          setEditorState({ ...editorState, turn: Number(event.target.value) })
        }
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
      />

      <label className="text-xs uppercase tracking-[0.3em] text-slate-500">
        Safe moves
      </label>
      <input
        value={editorState.expectedSafeMoves}
        onChange={(event) =>
          setEditorState({ ...editorState, expectedSafeMoves: event.target.value })
        }
        placeholder="up, down"
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
      />

      <label className="text-xs uppercase tracking-[0.3em] text-slate-500">
        You snake
      </label>
      <select
        value={editorState.youId}
        onChange={(event) =>
          setEditorState({ ...editorState, youId: event.target.value })
        }
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        {editorState.snakes.map((snakeItem) => (
          <option key={snakeItem.id} value={snakeItem.id}>
            {snakeItem.name}
          </option>
        ))}
      </select>

      <div className="border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Snakes</h3>
          <button
            onClick={addSnake}
            className="rounded-full border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
          >
            Add snake
          </button>
        </div>
        <div className="flex flex-col gap-3 mt-3">
          {editorState.snakes.map((snakeItem) => (
            <div
              key={snakeItem.id}
              className={`border rounded-xl p-3 flex flex-col gap-2 ${
                snakeItem.id === activeSnakeId
                  ? "border-slate-900"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setActiveSnakeId(snakeItem.id)}
                  className="text-sm font-semibold text-slate-800"
                >
                  {snakeItem.name}
                </button>
                {editorState.snakes.length > 1 ? (
                  <button
                    onClick={() => removeSnake(snakeItem.id)}
                    className="text-xs text-red-600"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <input
                value={snakeItem.name}
                onChange={(event) =>
                  updateSnake(snakeItem.id, (current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={snakeItem.id}
                  onChange={(event) =>
                    setEditorState((prev) => {
                      const nextId = event.target.value;
                      if (activeSnakeId === snakeItem.id) {
                        setActiveSnakeId(nextId);
                      }
                      return {
                        ...prev,
                        snakes: prev.snakes.map((item) =>
                          item.id === snakeItem.id
                            ? { ...item, id: nextId }
                            : item,
                        ),
                        youId:
                          prev.youId === snakeItem.id ? nextId : prev.youId,
                      };
                    })
                  }
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                />
                <input
                  value={snakeItem.squad}
                  onChange={(event) =>
                    updateSnake(snakeItem.id, (current) => ({
                      ...current,
                      squad: event.target.value,
                    }))
                  }
                  placeholder="squad"
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                />
              </div>
              <input
                type="number"
                value={snakeItem.health}
                onChange={(event) =>
                  updateSnake(snakeItem.id, (current) => ({
                    ...current,
                    health: Number(event.target.value),
                  }))
                }
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
              />
              <button
                onClick={() =>
                  updateSnake(snakeItem.id, (current) => ({
                    ...current,
                    body: current.head ? [current.head] : [],
                  }))
                }
                className="text-xs text-slate-600 hover:text-slate-900"
              >
                Clear body
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">Placement tools</h3>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {(
            [
              { label: "Food", value: "food" },
              { label: "Hazard", value: "hazard" },
              { label: "Erase", value: "erase" },
              { label: "Head", value: "snakeHead" },
              { label: "Body", value: "snakeBody" },
            ] as { label: string; value: PlacementMode }[]
          ).map((tool) => (
            <button
              key={tool.value}
              onClick={() => setPlacementMode(tool.value)}
              className={`rounded-lg px-2 py-1 text-xs font-semibold border ${
                placementMode === tool.value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tool.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Active snake: {activeSnake?.name ?? "None"}
        </p>
      </div>
    </aside>
  );
}

function BoardEditor({
  editorState,
  setEditorState,
  placementMode,
  activeSnakeId,
}: {
  editorState: EditorState;
  setEditorState: EditorStateSetter;
  placementMode: PlacementMode;
  activeSnakeId: string;
}) {
  const handleCellClick = (x: number, y: number) => {
    const toggleCoordinate = (
      list: Coordinate[],
      nextValue = true,
    ): Coordinate[] => {
      const exists = list.some((coord) => coord.x === x && coord.y === y);
      if (exists && !nextValue) {
        return list.filter((coord) => !(coord.x === x && coord.y === y));
      }
      if (!exists && nextValue) {
        return [...list, { x, y }];
      }
      return list;
    };

    if (placementMode === "food") {
      const hasFood = editorState.food.some((coord) => coord.x === x && coord.y === y);
      setEditorState({
        ...editorState,
        food: toggleCoordinate(editorState.food, !hasFood),
      });
      return;
    }
    if (placementMode === "hazard") {
      const hasHazard = editorState.hazards.some(
        (coord) => coord.x === x && coord.y === y,
      );
      setEditorState({
        ...editorState,
        hazards: toggleCoordinate(editorState.hazards, !hasHazard),
      });
      return;
    }
    if (placementMode === "erase") {
      setEditorState({
        ...editorState,
        food: editorState.food.filter((coord) => !(coord.x === x && coord.y === y)),
        hazards: editorState.hazards.filter(
          (coord) => !(coord.x === x && coord.y === y),
        ),
        snakes: editorState.snakes.map((snakeItem) => {
          const nextBody = snakeItem.body.filter(
            (coord) => !(coord.x === x && coord.y === y),
          );
          const isHead = snakeItem.head?.x === x && snakeItem.head?.y === y;
          return {
            ...snakeItem,
            head: isHead ? undefined : snakeItem.head,
            body: nextBody,
          };
        }),
      });
      return;
    }

    const targetSnakeIndex = editorState.snakes.findIndex(
      (snakeItem) => snakeItem.id === activeSnakeId,
    );
    if (targetSnakeIndex < 0) {
      return;
    }

    const nextSnakes = [...editorState.snakes];
    const targetSnake = { ...nextSnakes[targetSnakeIndex] };
    const existingBody = targetSnake.body.filter(
      (coord) => !(coord.x === x && coord.y === y),
    );

    if (placementMode === "snakeHead") {
      targetSnake.head = { x, y };
      targetSnake.body = [{ x, y }, ...existingBody];
    } else if (placementMode === "snakeBody") {
      const nextBody = targetSnake.head
        ? [targetSnake.head, ...existingBody]
        : existingBody;
      if (!nextBody.some((coord) => coord.x === x && coord.y === y)) {
        nextBody.push({ x, y });
      }
      targetSnake.body = nextBody;
      if (!targetSnake.head) {
        targetSnake.head = { x, y };
      }
    }

    nextSnakes[targetSnakeIndex] = targetSnake;
    setEditorState({ ...editorState, snakes: nextSnakes });
  };

  return (
    <section className="bg-white/80 border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900">Board editor</h2>
      <p className="text-xs text-slate-500">
        Click tiles to place food, hazards, or snake segments.
      </p>
      <div className="p-4">
        <BoardView
          board={{
            height: editorState.height,
            width: editorState.width,
            food: editorState.food,
            hazards: editorState.hazards,
            snakes: editorState.snakes
              .map((snakeItem) => ({
                id: snakeItem.id,
                name: snakeItem.name,
                health: snakeItem.health,
                body: snakeItem.body,
                head: snakeItem.head ?? snakeItem.body[0],
                length: snakeItem.body.length,
                squad: snakeItem.squad,
              }))
              .filter((snakeItem) => Boolean(snakeItem.head)) as Snake[],
          }}
          youId={editorState.youId}
          onCellClick={handleCellClick}
        />
      </div>
    </section>
  );
}

function TestCard({
  testItem,
  result,
  isRunning,
  onRun,
}: {
  testItem: Test;
  result?: RunResult;
  isRunning: boolean;
  onRun: () => void;
}) {
  const youSnake = testItem.board.snakes.find(
    (snakeItem) => snakeItem.id === testItem.youId,
  );
  const status = result?.ok
    ? testItem.expectedSafeMoves.length === 0
      ? "move logged"
      : result.move && testItem.expectedSafeMoves.includes(result.move)
        ? "pass"
        : "fail"
    : result
      ? "error"
      : "idle";
  const statusStyles =
    status === "pass"
      ? "bg-lime-100 text-lime-700"
      : status === "fail"
        ? "bg-red-100 text-red-700"
        : status === "error"
          ? "bg-orange-100 text-orange-700"
          : "bg-slate-100 text-slate-600";

  return (
    <article className="bg-white/85 border border-slate-200 rounded-2xl p-4 flex flex-col gap-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {testItem.name}
          </h3>
          <p className="text-xs text-slate-500">
            Turn {testItem.turn} • You: {youSnake?.name ?? testItem.youId}
          </p>
        </div>
        <span
          className={`px-2 py-1 rounded-full text-[11px] uppercase tracking-[0.2em] ${statusStyles}`}
        >
          {status}
        </span>
      </div>
      <BoardView
        board={testItem.board}
        youId={testItem.youId}
        move={result?.move ?? null}
      />
      <div className="flex flex-col gap-2 text-sm text-slate-600">
        <p>
          Safe moves:{" "}
          {testItem.expectedSafeMoves.length
            ? testItem.expectedSafeMoves.join(", ")
            : "Not set"}
        </p>
        <p>
          Bot move:{" "}
          {isRunning
            ? "Running..."
            : result?.move ?? (result ? "No move" : "Not run")}
        </p>
        {result?.shout ? <p>Shout: {result.shout}</p> : null}
        {result?.error ? (
          <p className="text-xs text-red-600">{result.error}</p>
        ) : null}
      </div>
      <button
        onClick={onRun}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:border-slate-300 hover:bg-slate-50 transition"
      >
        Run test
      </button>
    </article>
  );
}

function BoardView({
  board,
  youId,
  onCellClick,
  move,
}: {
  board: Board;
  youId: string;
  onCellClick?: (x: number, y: number) => void;
  move?: string | null;
}) {
  const positionMap = useMemo(() => {
    const hazardSet = new Set(board.hazards.map((pos) => `${pos.x},${pos.y}`));
    const foodSet = new Set(board.food.map((pos) => `${pos.x},${pos.y}`));
    const snakeCells = new Map<
      string,
      {
        type: "head" | "body";
        color: string;
        isYou: boolean;
        snakeId: string;
      }
    >();
    const squadColors: Record<string, string> = {};
    let colorIndex = 0;
    board.snakes.forEach((snakeItem, snakeIndex) => {
      const squadKey = snakeItem.squad ?? `snake-${snakeIndex}`;
      if (!squadColors[squadKey]) {
        squadColors[squadKey] =
          FALLBACK_SQUAD_COLORS[colorIndex % FALLBACK_SQUAD_COLORS.length];
        colorIndex += 1;
      }
      const headKey = `${snakeItem.head.x},${snakeItem.head.y}`;
      snakeCells.set(headKey, {
        type: "head",
        color: squadColors[squadKey],
        isYou: snakeItem.id === youId,
        snakeId: snakeItem.id,
      });
      snakeItem.body.forEach((segment) => {
        const key = `${segment.x},${segment.y}`;
        if (key === headKey) {
          return;
        }
        snakeCells.set(key, {
          type: "body",
          color: squadColors[squadKey],
          isYou: snakeItem.id === youId,
          snakeId: snakeItem.id,
        });
      });
    });
    return { hazardSet, foodSet, snakeCells };
  }, [board, youId]);

  const moveTargetKey = useMemo(() => {
    if (!move) {
      return null;
    }
    const youSnake = board.snakes.find((snakeItem) => snakeItem.id === youId);
    if (!youSnake) {
      return null;
    }
    const offsets: Record<string, Coordinate> = {
      up: { x: 0, y: 1 },
      down: { x: 0, y: -1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const offset = offsets[move];
    if (!offset) {
      return null;
    }
    const target = {
      x: youSnake.head.x + offset.x,
      y: youSnake.head.y + offset.y,
    };
    if (
      target.x < 0 ||
      target.y < 0 ||
      target.x >= board.width ||
      target.y >= board.height
    ) {
      return null;
    }
    return `${target.x},${target.y}`;
  }, [board, move, youId]);

  const rows = Array.from({ length: board.height }, (_, index) => {
    return board.height - 1 - index;
  });
  const columns = Array.from({ length: board.width }, (_, index) => index);

  const gapPx = 4;

  return (
    <div className="w-full">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${board.width}, minmax(0, 1fr))`,
          gap: `${gapPx}px`,
        }}
      >
        {rows.map((y) =>
          columns.map((x) => {
            const key = `${x},${y}`;
            const snakeCell = positionMap.snakeCells.get(key);
            const isHazard = positionMap.hazardSet.has(key);
            const isFood = positionMap.foodSet.has(key);
            const baseStyles =
              "aspect-square w-full rounded-sm border p-0 leading-none relative";
            const borderColor = snakeCell
              ? "border-transparent"
              : "border-slate-200";
            const background = isHazard
              ? "rgba(220, 38, 38, 0.85)"
              : isFood
                ? "rgba(101, 163, 13, 0.75)"
                : "rgba(255, 255, 255, 0.8)";
            const moveClass =
              moveTargetKey === key ? "ring-2 ring-slate-700/60" : "";
            const hasSnake = Boolean(snakeCell);
            const neighbor = (dx: number, dy: number) =>
              positionMap.snakeCells.get(`${x + dx},${y + dy}`);
            const sameSnake = (cell?: { snakeId: string } | undefined) =>
              cell && snakeCell && cell.snakeId === snakeCell.snakeId;
            const connectRight = hasSnake && sameSnake(neighbor(1, 0));
            const connectLeft = hasSnake && sameSnake(neighbor(-1, 0));
            const connectUp = hasSnake && sameSnake(neighbor(0, 1));
            const connectDown = hasSnake && sameSnake(neighbor(0, -1));
            return (
              <button
                key={key}
                type="button"
                onClick={onCellClick ? () => onCellClick(x, y) : undefined}
                className={`${baseStyles} ${borderColor} ${moveClass} flex items-center justify-center`}
                style={{ background }}
              >
                {hasSnake ? (
                  <>
                    <span
                      className="absolute pointer-events-none rounded-sm"
                      style={{
                        inset: "2px",
                        background: snakeCell?.color,
                      }}
                    />
                    {connectRight || connectLeft || connectUp || connectDown ? (
                      <span
                        className="absolute pointer-events-none"
                        style={{
                          left: connectLeft ? `${-gapPx}px` : "2px",
                          right: connectRight ? `${-gapPx}px` : "2px",
                          top: connectUp ? `${-gapPx}px` : "2px",
                          bottom: connectDown ? `${-gapPx}px` : "2px",
                          background: snakeCell?.color,
                          borderRadius: "2px",
                        }}
                      />
                    ) : null}
                  </>
                ) : null}
                {moveTargetKey === key ? (
                  <span className="absolute inset-0 rounded-sm bg-slate-900/10 pointer-events-none" />
                ) : null}
                {snakeCell?.type === "head" ? (
                  <span className="relative z-10 h-2 w-2 rounded-full bg-white/90" />
                ) : null}
                {!snakeCell && isHazard ? (
                  <span className="relative z-10 text-[10px] text-white font-bold">
                    !
                  </span>
                ) : null}
                {!snakeCell && isFood ? (
                  <span className="relative z-10 text-[10px] text-white font-bold">
                    +
                  </span>
                ) : null}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
