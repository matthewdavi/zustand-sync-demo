// PeopleGrid.tsx

import { usePeopleStore, peopleStoreActions } from "./use-people-store";
import React from "react";
const sleep = (time: number) => new Promise((res) => setTimeout(res, time));

export function PeopleGrid_() {
  const people = usePeopleStore((state) => state.people);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mt-6 max-h-[80vh] overflow-y-auto shadow-md">
      <h2 className="text-2xl font-bold text-green-500 mb-4">
        Net Worth Leaderboard
      </h2>
      <button
        onClick={async () => {
          for (let i = 1; i < 100; i++) {
            await sleep(20);
            peopleStoreActions.adjustNetWorths(1000);
          }
        }}
        className="bg-red"
      >
        Shuffle
      </button>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {people.map((person) => (
          <div
            key={person.id}
            className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:shadow-lg transition-all"
          >
            <div className="text-white font-semibold text-lg truncate">
              {person.name}
            </div>
            <div
              className={`text-sm mt-1 font-mono ${
                person.netWorth >= 0 ? "text-green-400" : "text-red-400"
              }`}
            >
              $
              {person.netWorth.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="text-xs text-gray-500 mt-2 break-all">
              {person.id}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const PeopleGrid = React.memo(PeopleGrid_);
