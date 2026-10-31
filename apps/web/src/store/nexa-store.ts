import { create } from "zustand";

type NexaState = {
  activeFeed: string;
  setActiveFeed: (feed: string) => void;
};

export const useNexaStore = create<NexaState>((set) => ({
  activeFeed: "Inicio",
  setActiveFeed: (activeFeed) => set({ activeFeed }),
}));
