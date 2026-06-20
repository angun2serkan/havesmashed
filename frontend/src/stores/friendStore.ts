import { create } from "zustand";
import type { Connection, FriendDate } from "@/types";

interface FriendState {
  connections: Connection[];
  friendDates: FriendDate[];
  setConnections: (connections: Connection[]) => void;
  setFriendDates: (dates: FriendDate[]) => void;
  removeConnection: (id: string) => void;
  updateConnectionColor: (id: string, color: string) => void;
}

export const useFriendStore = create<FriendState>((set) => ({
  connections: [],
  friendDates: [],
  setConnections: (connections) => set({ connections }),
  setFriendDates: (dates) => set({ friendDates: dates }),
  removeConnection: (id) =>
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
    })),
  updateConnectionColor: (id, color) =>
    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === id ? { ...c, color } : c,
      ),
    })),
}));
