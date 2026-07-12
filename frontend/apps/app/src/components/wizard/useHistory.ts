import { useCallback, useReducer } from "react";

const MAX_HISTORY = 50;

export type HistoryEntry<T> = {
  state: T;
  timestamp: number;
  label?: string;
};

type HistoryState<T> = {
  entries: Array<HistoryEntry<T>>;
  index: number;
};

type HistoryAction<T> =
  | { type: "set"; state: T; label?: string }
  | { type: "undo" }
  | { type: "redo" };

function reducer<T>(
  prev: HistoryState<T>,
  action: HistoryAction<T>,
): HistoryState<T> {
  switch (action.type) {
    case "set": {
      // Drop any redo entries ahead of the cursor, then append the new state.
      const kept = prev.entries.slice(0, prev.index + 1);
      const next = [
        ...kept,
        { state: action.state, timestamp: Date.now(), label: action.label },
      ];
      // Trim from the front once we exceed the cap.
      const trimmed =
        next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      return { entries: trimmed, index: trimmed.length - 1 };
    }
    case "undo":
      return prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev;
    case "redo":
      return prev.index < prev.entries.length - 1
        ? { ...prev, index: prev.index + 1 }
        : prev;
    default:
      return prev;
  }
}

export interface UseHistoryResult<T> {
  state: T;
  set: (next: T, label?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  history: Array<HistoryEntry<T>>;
  currentIndex: number;
}

export function useHistory<T>(initial: T): UseHistoryResult<T> {
  const [state, dispatch] = useReducer(reducer<T>, undefined, () => ({
    entries: [{ state: initial, timestamp: Date.now() }],
    index: 0,
  }));

  const set = useCallback((next: T, label?: string) => {
    dispatch({ type: "set", state: next, label });
  }, []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);

  return {
    state: state.entries[state.index].state,
    set,
    undo,
    redo,
    canUndo: state.index > 0,
    canRedo: state.index < state.entries.length - 1,
    history: state.entries,
    currentIndex: state.index,
  };
}
