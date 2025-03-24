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

// A faster check that doesn't need to stringify the entire object
function isSerializable(obj: any, seen = new WeakSet()): boolean {
  // Handle primitives and null
  if (obj === null || obj === undefined) return true;
  if (typeof obj !== "object")
    return typeof obj !== "function" && typeof obj !== "symbol";

  // Detect circular references
  if (seen.has(obj)) return false;
  seen.add(obj);

  // Check special objects that can't be cloned
  if (
    obj instanceof Error ||
    obj instanceof WeakMap ||
    obj instanceof WeakSet ||
    obj instanceof Map ||
    obj instanceof Set ||
    obj instanceof Promise ||
    obj instanceof RegExp ||
    obj instanceof Date
  ) {
    return true; // These are actually serializable by structured clone
  }

  // Check all object properties
  return Object.keys(obj).every((key) => isSerializable(obj[key], seen));
}

// Add this deep equality function somewhere in your file
function deepEqual(a: any, b: any): boolean {
  // Handle primitive types and referential equality
  if (a === b) return true;

  // If either is null or not an object, they can't be equal at this point
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  )
    return false;

  // Arrays require special handling
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  // Compare object keys
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  // Check if every key-value in a has a match in b
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key])
  );
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
export const createWithSync = <T extends Record<string, any>>(options: {
  exclude?: (keyof T | RegExp)[];
  name: string;
}) => {
  // We'll compute the channel name based on the initial state later.
  const syncOptions: SyncTabsOptionsType<T> = {
    name: options.name,
    exclude: options?.exclude,
  };

  return <Mos extends [StoreMutatorIdentifier, unknown][]>(
    initializer: StateCreator<T, [], Mos>
  ): UseBoundStore<Mutate<StoreApi<T>, Mos>> => {
    return create<T>()((set, get, api) => {
      // Compute a deterministic channel name from the initial state.

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

      // Create a memoization cache outside the loop
      const serializableCache = new WeakMap<object, boolean>();

      const getKeysToSync = (): string[] => {
        const currentState = get() as Record<string, any>;
        return Object.keys(currentState).filter((key) => {
          // First handle exclusions
          if (
            syncOptions.exclude &&
            matchPatternOrKey(key, syncOptions.exclude)
          )
            return false;

          const value = currentState[key];
          if (typeof value === "function") return false;

          // Check objects with memoization
          if (value && typeof value === "object") {
            // Check cache first
            if (serializableCache.has(value)) {
              return serializableCache.get(value);
            }

            try {
              // Still use JSON.stringify but cache the result
              JSON.stringify(value);
              serializableCache.set(value, true);
              return true;
            } catch (e) {
              serializableCache.set(value, false);
              return false;
            }
          }

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
          // Get current state
          const currentState = get();

          // Create an object to hold only changed fields
          const changedFields: Record<string, any> = {};

          // // Check each field in payload against current state
          // Object.keys(message.payload).forEach((key) => {
          //   // Only include if the field has actually changed (deep comparison)
          //   // if (!deepEqual(message.payload[key], currentState[key])) {
          //   changedFields[key] = message.payload[key];
          //   // }
          // });

          // Only update state if there are actual changes
          if (Object.keys(changedFields).length > 0 || true) {
            set((prev: any) => ({ ...prev, ...message.payload }));
          } else {
            console.log("STATE_UPDATE (no fields changed, skipping update)");
          }
        }
      });

      return initializer(customSet, get, api);
    });
  };
};
