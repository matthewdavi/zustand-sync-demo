/* eslint-disable no-plusplus */
/* eslint-disable no-bitwise */
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

interface SyncChannel {
  postMessage: (msg: any) => void;
  onMessage: (handler: (msg: any) => void) => void;
}
/**
 * Compute a deterministic hash string using the djb2 algorithm on the given string.
 * Returns a prefixed hexadecimal hash used to uniquely identify a channel.
 */
function hashStr(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return `channel-${(hash >>> 0).toString(16)}`;
}

/**
 * Generate a deterministic hash for an object by converting it to JSON.
 * Useful for comparing states across different instances.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// @ts-ignore
function hashState(obj: any): string {
  return hashStr(JSON.stringify(obj));
}

/**
 * Retrieve a communication channel for state synchronization.
 * Uses BroadcastChannel if available; otherwise, falls back to Electron’s API.
 */
function getSyncChannel(name: string): SyncChannel | null {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(name);
    return {
      postMessage: (msg: any) => channel.postMessage(msg),
      onMessage: (handler: (msg: any) => void) => {
        channel.onmessage = (event: MessageEvent) => handler(event.data);
      },
    };
  }
  if (typeof window !== "undefined" && (window as any).electronAPI) {
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

/**
 * Check if the given key matches any of the provided exclusion patterns.
 * Supports both string and RegExp matching.
 */
function matchPatternOrKey<T>(key: string, patterns: (keyof T | RegExp)[]) {
  for (const patternOrKey of patterns) {
    if (typeof patternOrKey === "string" && key === patternOrKey) {
      return true;
    }
    if (patternOrKey instanceof RegExp && patternOrKey.test(key)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an object is serializable via structuredClone.
 * Uses structuredClone to verify cloneability, which supports Maps, Sets, etc.
 */

/**
 * Deeply compare two values for equality.
 * Recursively checks objects and arrays to confirm structural equality.
 */
// @ts-expect-error
function deepEqual(a: any, b: any): boolean {
  // Handle primitive types and identical references.
  if (a === b) {
    return true;
  }

  // If either value is null or not an object, they are not equal.
  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }

  // Special handling for arrays.
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((item, index) => deepEqual(item, b[index]));
  }

  // Compare object keys.
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }

  // Ensure every key/value in a exists and matches in b.
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key])
  );
}

/**
 * Exported helper that wraps Zustand's create() with state synchronization middleware.
 *
 * This function intercepts state updates and sends diffs to other instances via a sync channel.
 */
export const createWithSync = <T extends Record<string, any>>(options: {
  exclude?: (keyof T | RegExp)[];
  name: string;
}) => {
  // Setup options for synchronization based on provided parameters.
  const syncOptions: SyncTabsOptionsType<T> = {
    name: options.name,
    exclude: options?.exclude,
  };

  return <Mos extends [StoreMutatorIdentifier, unknown][]>(
    initializer: StateCreator<T, [], Mos>
  ): UseBoundStore<Mutate<StoreApi<T>, Mos>> =>
    create<T>()((set, get, api) => {
      // Create a unique instance identifier.
      const instanceId = Math.random().toString(36).slice(2);
      const channel = getSyncChannel(syncOptions.name);

      if (!channel) {
        console.warn("No supported sync channel available!");
        return initializer(set, get, api);
      }

      let pendingDiff: Record<string, any> = {};
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flushInterval = 50; // milliseconds

      /**
       * Flush pending state changes over the sync channel.
       * Sends accumulated differences and resets the pending diff object.
       */
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

      /**
       * Schedule a flush of pending state differences if not already scheduled.
       * This batches state updates to send them at a controlled interval.
       */
      const scheduleFlush = () => {
        if (flushTimer === null) {
          flushTimer = setTimeout(flushDiff, flushInterval);
        }
      };

      // Cache for memoizing structuredClone checks for object serializability.
      const serializableCache = new WeakMap<object, boolean>();

      /**
       * Determine which keys in the current state should be synchronized.
       * Filters out functions, excluded keys, and non-cloneable values.
       */
      const getKeysToSync = (): string[] => {
        const currentState = get() as Record<string, any>;
        return Object.keys(currentState).filter((key) => {
          // Exclude keys matching provided patterns.
          if (
            syncOptions.exclude &&
            matchPatternOrKey(key, syncOptions.exclude)
          ) {
            return false;
          }

          const value = currentState[key];
          if (typeof value === "function") {
            return false;
          }

          // For objects, check cloneability using structuredClone.
          if (value && typeof value === "object") {
            if (serializableCache.has(value)) {
              return serializableCache.get(value);
            }
            try {
              structuredClone(value);
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

      // On startup, request the full state from other instances.
      channel.postMessage({ type: LOAD, source: instanceId });

      /**
       * Custom set function wrapping the original state update.
       * Records state differences for synchronization across tabs or windows.
       */
      const customSet: typeof set = (stateOrFn, replace?) => {
        const prevState = get();
        set(stateOrFn, replace);
        const currentState = get();
        const keysToSync = getKeysToSync();
        if (keysToSync.length === 0) {
          return;
        }
        keysToSync.forEach((key) => {
          if (currentState[key] !== prevState[key]) {
            pendingDiff[key] = currentState[key];
          }
        });
        scheduleFlush();
      };

      /**
       * Listen for incoming synchronization messages.
       * For LOAD messages, send the full state; for STATE_UPDATE, merge incoming state changes.
       * Note: The current deep comparison logic in the STATE_UPDATE handler is bypassed.
       */
      channel.onMessage((message: any) => {
        if (!message || message.source === instanceId) {
          return;
        }
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
          const currentState = get();
          const changedFields: Record<string, any> = {};

          // we do a shallow equality check here to see if the state has changed
          // this is a performance optimization to avoid deep equality checks
          Object.keys(message.payload).forEach((key) => {
            if (message.payload[key] !== currentState[key]) {
              changedFields[key] = message.payload[key];
            }
          });

          // I've found it faster to just update the state every time vs  doing the deep equality check
          if (Object.keys(changedFields).length > 0) {
            set((prev: any) => ({ ...prev, ...message.payload }));
          } else {
            console.log("STATE_UPDATE (no fields changed, skipping update)");
          }
        }
      });

      return initializer(customSet, get, api);
    });
};
