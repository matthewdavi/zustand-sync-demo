import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";
import { useSharedStore } from "./use-synced-store";
import { PeopleGrid } from "./PeopleGrid";

const { increment, setName } = useSharedStore.getState();

const sleep = (time: number) => new Promise((res) => setTimeout(res, time));

export function App() {
  const count = useSharedStore((state) => state.count);
  const name = useSharedStore((state) => state.name);
  const delay = useSharedStore((state) => state.delay);
  const [incrementAmount, setIncrementAmount] = useState(1000);

  const handleIncrementAsync = async () => {
    for (let i = 0; i < incrementAmount; i++) {
      increment();
      await sleep(delay);
    }
  };

  const handleIncrementSync = () => {
    for (let i = 0; i < incrementAmount; i++) {
      increment();
    }
  };

  const handleDecrementSync = () => {
    for (let i = 0; i < incrementAmount; i++) {
      useSharedStore.getState().decrement();
    }
  };

  const handleDecrementAsync = async () => {
    for (let i = 0; i < incrementAmount; i++) {
      useSharedStore.getState().decrement();
      await sleep(delay);
    }
  };

  const handleSyncLoop = () => {
    const startTime = performance.now();
    let iterations = 0;

    while (performance.now() - startTime < 1000) {
      increment();
    }

    console.log(`Completed ${iterations} increments in 1 second`);
  };

  const handleResetCount = () => {
    useSharedStore.getState().resetCount();
  };

  return (
    <main className="min-h-screen bg-black text-white font-mono p-8">
      <div className="flex justify-center space-x-6 mb-8">
        <a href="https://vite.dev" target="_blank">
          <img
            src={viteLogo}
            className="logo hover:opacity-80"
            alt="Vite logo"
          />
        </a>
        <a href="https://react.dev" target="_blank">
          <img
            src={reactLogo}
            className="logo react hover:opacity-80"
            alt="React logo"
          />
        </a>
      </div>

      <h1 className="text-3xl font-extrabold text-green-500 mb-2">
        Zustand Tab Sync
      </h1>
      <p className="text-sm text-gray-400 mb-6">
        Real-time state synchronization across browser tabs using Zustand. Open
        in multiple tabs and see the magic of financial-grade reactive sync.
      </p>

      <div className="bg-gray-900 rounded-xl p-6 shadow-md space-y-6 border border-gray-700">
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={handleIncrementSync}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-black font-semibold py-2 rounded"
            >
              <span>{"Increment All at Once"}</span>
            </button>
            <button
              onClick={handleIncrementAsync}
              className="flex-1 bg-green-600 hover:bg-green-500 text-black font-semibold py-2 rounded"
            >
              <span>{"Increment with Delay"}</span>
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDecrementSync}
              className="flex-1 bg-red-600 hover:bg-red-500 text-black font-semibold py-2 rounded"
            >
              <span>{"Decrement All at Once"}</span>
            </button>
            <button
              onClick={handleDecrementAsync}
              className="flex-1 bg-pink-600 hover:bg-pink-500 text-black font-semibold py-2 rounded"
            >
              <span>{"Decrement with Delay"}</span>
            </button>
          </div>
          <button
            onClick={handleSyncLoop}
            className="w-full bg-purple-600 hover:bg-purple-500 text-black font-semibold py-2 rounded mt-2"
          >
            <span>
              {"1-Second Blocking Increment (compute syncs / second)"}
            </span>
          </button>
          <button
            onClick={handleResetCount}
            className="w-full bg-yellow-600 hover:bg-yellow-500 text-black font-semibold py-2 rounded mt-2"
          >
            <span>{"Reset Count to Zero"}</span>
          </button>
          <div className="text-xl text-red-400">Count: {count}</div>
        </div>

        <div className="space-y-1">
          <label className="block text-xs uppercase tracking-wider text-gray-400">
            Type some stuff in here to test the responsiveness
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-black text-white border border-gray-600 px-3 py-1 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs uppercase tracking-wider text-gray-400">
            Increment Delay (ms)
          </label>
          <input
            type="number"
            value={delay}
            onChange={(e) =>
              useSharedStore.getState().setDelay(Number(e.target.value))
            }
            className="w-full bg-black text-white border border-gray-600 px-3 py-1 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
            min={0}
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs uppercase tracking-wider text-gray-400">
            Increment Count
          </label>
          <input
            type="number"
            value={incrementAmount}
            onChange={(e) => setIncrementAmount(Number(e.target.value))}
            className="w-full bg-black text-white border border-gray-600 px-3 py-1 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
            min={1}
          />
        </div>
      </div>
      <PeopleGrid />
      <footer className="text-xs text-gray-500 pt-8 text-center">
        Built for speed. Optimized for Wall Street. Powered by Zustand.
      </footer>
    </main>
  );
}

export default App;
