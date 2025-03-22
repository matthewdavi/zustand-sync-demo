import {
  StateCreator,
  StoreApi,
  UseBoundStore,
  create,
  Mutate,
  StoreMutatorIdentifier,
} from "zustand";

// Instead of constraining to object, we require a record so that indexing works.
export interface SyncTabsOptionsType<T> {
  name: string;
  exclude?: (keyof T | RegExp)[];
}

const LOAD = "LOAD";
const STATE_UPDATE = "STATE_UPDATE";

// A simple djb2-hash to compute a deterministic string from a JSON string.
function hashStr(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return "channel-" + (hash >>> 0).toString(16);
}

function hashState(obj: any): string {
  return hashStr(JSON.stringify(obj));
}

interface SyncChannel {
  postMessage: (message: any) => void;
  onMessage: (handler: (message: any) => void) => void;
}

function getSyncChannel(name: string): SyncChannel | null {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(name);
    return {
      postMessage: (msg: any) => channel.postMessage(msg),
      onMessage: (handler: (msg: any) => void) => {
        channel.onmessage = (event: MessageEvent) => handler(event.data);
      },
    };
  } else if (typeof window !== "undefined" && (window as any).electronAPI) {
    return {
      postMessage: (msg: any) => (window as any).electronAPI.send(name, msg),
      onMessage: (handler: (msg: any) => void) => {
        (window as any).electronAPI.on(name, (_event: any, message: any) =>
          handler(message)
        );
      },
    };
  }
  return null;
}

function matchPatternOrKey<T>(key: string, patterns: (keyof T | RegExp)[]) {
  for (const patternOrKey of patterns) {
    if (typeof patternOrKey === "string" && key === patternOrKey) return true;
    else if (patternOrKey instanceof RegExp && patternOrKey.test(key))
      return true;
  }
  return false;
}

/**
 * Exported helper that wraps Zustand's create() with our sync middleware.
 *
 * Usage:
 *
 * const useSharedStore = createWithSync<MyStore>()(
 *   immer((set) => ({
 *     count: 0,
 *     increment: () => set(state => { state.count += 1 }),
 *   }))
 * );
 *
 * The returned type exactly matches the curried version of create<T>(), i.e.
 * <Mos extends [StoreMutatorIdentifier, unknown][] = []>(initializer: StateCreator<T, [], Mos>) =>
 *   UseBoundStore<Mutate<StoreApi<T>, Mos>>
 */
export const createWithSync = <T extends Record<string, any>>(options?: {
  exclude?: (keyof T | RegExp)[];
}) => {
  // We'll compute the channel name based on the initial state later.
  const syncOptions: SyncTabsOptionsType<T> = {
    name: "",
    exclude: options?.exclude,
  };

  return <Mos extends [StoreMutatorIdentifier, unknown][]>(
    initializer: StateCreator<T, [], Mos>
  ): UseBoundStore<Mutate<StoreApi<T>, Mos>> => {
    return create<T>()((set, get, api) => {
      // Compute a deterministic channel name from the initial state.
      const initialState = api.getInitialState();
      syncOptions.name = hashState(initialState);
      const instanceId = Math.random().toString(36).slice(2);
      const channel = getSyncChannel(syncOptions.name);

      if (!channel) {
        console.warn("No supported sync channel available!");
        return initializer(set, get, api);
      }

      let pendingDiff: Record<string, any> = {};
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flushInterval = 50; // milliseconds

      const flushDiff = () => {
        if (Object.keys(pendingDiff).length > 0) {
          channel.postMessage({
            type: STATE_UPDATE,
            source: instanceId,
            payload: { ...pendingDiff },
          });
          pendingDiff = {};
        }
        flushTimer = null;
      };

      const scheduleFlush = () => {
        if (flushTimer === null) {
          flushTimer = setTimeout(flushDiff, flushInterval);
        }
      };

      const getKeysToSync = (): string[] => {
        const currentState = get() as Record<string, any>;
        return Object.keys(currentState).filter((key) => {
          if (
            syncOptions.exclude &&
            matchPatternOrKey(key, syncOptions.exclude)
          )
            return false;
          if (typeof currentState[key] === "function") return false;
          return true;
        });
      };

      // On startup, request full state from other windows.
      channel.postMessage({ type: LOAD, source: instanceId });

      const customSet: typeof set = (stateOrFn, replace?) => {
        const prevState = get();
        set(stateOrFn, replace);
        const currentState = get();
        const keysToSync = getKeysToSync();
        if (keysToSync.length === 0) return;
        keysToSync.forEach((key) => {
          if (currentState[key] !== prevState[key]) {
            pendingDiff[key] = currentState[key];
          }
        });
        scheduleFlush();
      };

      channel.onMessage((message: any) => {
        if (!message || message.source === instanceId) return;
        if (message.type === LOAD) {
          const keysToSync = getKeysToSync();
          const currentState = get() as Record<string, any>;
          const fullState: Record<string, any> = {};
          keysToSync.forEach((key) => {
            fullState[key] = currentState[key];
          });
          channel.postMessage({
            type: STATE_UPDATE,
            source: instanceId,
            payload: fullState,
          });
        } else if (message.type === STATE_UPDATE) {
          set((prev: any) => ({ ...prev, ...message.payload }));
        }
      });

      return initializer(customSet, get, api);
    });
  };
};
