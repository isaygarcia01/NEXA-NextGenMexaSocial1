import { create } from "zustand";

type NexaState = {
  activeFeed: string;
  accessToken: string | null;
  user: { id: string; email: string; username: string } | null;
  setActiveFeed: (feed: string) => void;
  setAuth: (accessToken: string, user: NexaState["user"]) => void;
  clearAuth: () => void;
};

export const useNexaStore = create<NexaState>((set) => ({
  activeFeed: "Inicio",
  accessToken: null,
  user: null,
  setActiveFeed: (activeFeed) => set({ activeFeed }),
  setAuth: (accessToken, user) => set({ accessToken, user }),
  clearAuth: () => set({ accessToken: null, user: null }),
}));
