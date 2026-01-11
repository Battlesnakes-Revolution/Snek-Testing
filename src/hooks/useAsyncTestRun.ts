import { useState, useCallback } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type RunResult = {
  ok: boolean;
  move?: string | null;
  shout?: string | null;
  passed?: boolean;
  error?: string;
  status?: number;
  responseTimeMs?: number;
};

type TestRunState = {
  status: "idle" | "running" | "completed" | "failed";
  result?: RunResult;
};

export function useAsyncTestRun(token: string | null) {
  const [runStates, setRunStates] = useState<Record<string, TestRunState>>({});
  const [runError, setRunError] = useState<string | null>(null);

  const startTestRun = useMutation(api.battlesnake.startTestRun);
  const executeTestRun = useAction(api.battlesnake.executeTestRun);

  const runTest = useCallback(
    async (testId: Id<"tests">, botUrl: string) => {
      if (!token) {
        setRunError("Please log in to run tests.");
        return;
      }

      if (!botUrl.trim()) {
        setRunError("Add a bot URL before running tests.");
        return;
      }

      setRunError(null);
      setRunStates((prev) => ({
        ...prev,
        [testId]: { status: "running" },
      }));

      try {
        const { runId } = await startTestRun({
          token,
          testId,
          botUrl,
        });

        executeTestRun({ runId }).then((result) => {
          if (result.ok) {
            setRunStates((prev) => ({
              ...prev,
              [testId]: {
                status: "completed",
                result: {
                  ok: true,
                  move: result.move,
                  shout: result.shout,
                  passed: result.passed,
                  responseTimeMs: result.responseTimeMs,
                },
              },
            }));
          } else {
            setRunStates((prev) => ({
              ...prev,
              [testId]: {
                status: "failed",
                result: {
                  ok: false,
                  error: result.error,
                },
              },
            }));
          }
        }).catch((error) => {
          setRunStates((prev) => ({
            ...prev,
            [testId]: {
              status: "failed",
              result: {
                ok: false,
                error: error instanceof Error ? error.message : "Test execution failed.",
              },
            },
          }));
        });
      } catch (error) {
        setRunStates((prev) => ({
          ...prev,
          [testId]: {
            status: "failed",
            result: {
              ok: false,
              error: error instanceof Error ? error.message : "Failed to start test.",
            },
          },
        }));
      }
    },
    [token, startTestRun, executeTestRun]
  );

  const runAllTests = useCallback(
    async (tests: Array<{ _id: Id<"tests"> }>, botUrl: string) => {
      if (!token) {
        setRunError("Please log in to run tests.");
        return;
      }

      if (!botUrl.trim()) {
        setRunError("Add a bot URL before running tests.");
        return;
      }

      setRunError(null);
      await Promise.all(tests.map((test) => runTest(test._id, botUrl)));
    },
    [token, runTest]
  );

  const isRunning = useCallback(
    (testId: string) => runStates[testId]?.status === "running",
    [runStates]
  );

  const getResult = useCallback(
    (testId: string) => runStates[testId]?.result,
    [runStates]
  );

  const clearResults = useCallback(() => {
    setRunStates({});
    setRunError(null);
  }, []);

  return {
    runTest,
    runAllTests,
    isRunning,
    getResult,
    runStates,
    runError,
    clearResults,
  };
}
