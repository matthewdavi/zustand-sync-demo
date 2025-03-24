// PeopleGrid.tsx

import { usePeopleStore, peopleStoreActions } from "./use-people-store";
import React from "react";
import { VList } from "virtua";
const sleep = (time: number) => new Promise((res) => setTimeout(res, time));

export function PeopleGrid_() {
  const people = usePeopleStore((state) => state.state.people);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mt-6 max-h-[80vh] overflow-y-auto shadow-md">
      <h2 className="text-2xl font-bold text-green-500 mb-4">
        Net Worth Leaderboard
      </h2>
      <button
        onClick={async () => {
          for (let i = 0; i < 100; i++) {
            await sleep(200);
            peopleStoreActions.randomizePeople();
          }
        }}
        className="bg-orange-600 hover:bg-orange-500 text-black font-semibold py-2 px-4 rounded mb-4 transition-colors duration-200"
      >
        <span>
          {"Update all 100,000 people net worths every 200ms 100 times"}
        </span>
      </button>
      <VList
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4"
        style={{ height: "300px" }}
      >
        {people.slice(0, 100).map((person) => (
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
      </VList>
    </div>
  );
}

export const PeopleGrid = React.memo(PeopleGrid_);
