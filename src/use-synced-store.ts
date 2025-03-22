import { createWithSync } from "./sync-zustand/sync-zustand-middleware";
import { immer } from "zustand/middleware/immer";

interface MyStore {
  count: number;
  increment: () => void;
  decrement: () => void;
  setName: (newName: string) => void;
  name: string;
  setDelay: (newTime: number) => void;
  delay: number;
}

export const useSharedStore = createWithSync<MyStore>()(
  immer((set) => ({
    count: 0,
    increment: () =>
      set((state) => {
        state.count += 1;
      }),
    decrement: () =>
      set((state) => {
        state.count -= 1;
      }),
    delay: 20,
    name: "",
    setName: (newName: string) =>
      set((state) => {
        state.name = newName;
      }),
    setDelay: (newTime: number) =>
      set((state) => {
        state.delay = Math.max(1, newTime);
      }),
  }))
);
