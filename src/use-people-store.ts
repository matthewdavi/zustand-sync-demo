import { createWithSync } from "./sync-zustand/sync-zustand-middleware";
import { produce } from "immer";
import { faker } from "@faker-js/faker";

interface PeopleStore {
  state: {
    people: Person[];
  };
  actions: {
    addPerson: () => void;
    removePerson: (id: string) => void;
    updateNetWorth: (id: string, amount: number) => void;
    randomizePeople: () => void;
    adjustNetWorths: (count: number) => void;
  };
}

interface Person {
  id: string;
  name: string;
  netWorth: number;
}

export const usePeopleStore = createWithSync<PeopleStore>({
  name: "people-store",
})((set, get) => ({
  state: {
    people: Array.from({ length: 100_000 }, () => ({
      id: faker.string.uuid(),
      name: faker.person.fullName(),
      netWorth: faker.number.float({ min: 0, max: 1_000_000 }),
    })).sort((a, b) => b.netWorth - a.netWorth),
  },
  actions: {
    addPerson: () =>
      set((state) => ({
        state: {
          people: [
            ...state.state.people,
            {
              id: faker.string.uuid(),
              name: faker.person.fullName(),
              netWorth: faker.number.float({ min: -1_000_000, max: 1_000_000 }),
            },
          ],
        },
      })),
    removePerson: (id) =>
      set((state) => ({
        state: {
          people: state.state.people.filter((p) => p.id !== id),
        },
      })),
    updateNetWorth: (id, amount) =>
      set((state) => ({
        state: {
          people: state.state.people
            .map((p) =>
              p.id === id ? { ...p, netWorth: p.netWorth + amount } : p
            )
            .sort((a, b) => b.netWorth - a.netWorth),
        },
      })),
    randomizePeople: () => {
      set((state) => ({
        state: {
          people: state.state.people.map((p) => ({
            ...p,
            netWorth: faker.number.float({ min: 0, max: 1_000_000 }),
          })),
        },
      }));
    },
    adjustNetWorths(count) {
      const people = get().state.people;
      set((prev) => {
        return produce(prev, (draft) => {
          for (let i = 0; i < count; i++) {
            const person =
              draft.state.people[Math.floor(Math.random() * people.length)];
            person.netWorth = faker.number.float({
              min: -1_000_000,
              max: 1_000_000,
            });
          }
        });
      });
    },
  },
}));

export const peopleStoreActions = usePeopleStore.getState().actions;
