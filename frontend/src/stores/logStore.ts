import { create } from "zustand";
import type { DateEntry, Stats } from "@/types";

interface DateState {
  dates: DateEntry[];
  stats: Stats;
  selectedCountry: string | null;
  selectedCity: { id: number; name: string } | null;
  isDateFormOpen: boolean;
  setDates: (dates: DateEntry[]) => void;
  addDate: (entry: DateEntry) => void;
  removeDate: (id: string) => void;
  updateDate: (id: string, entry: Partial<DateEntry>) => void;
  setStats: (stats: Stats) => void;
  setSelectedCountry: (code: string | null) => void;
  setSelectedCity: (
    city: { id: number; name: string } | null,
  ) => void;
  openDateForm: () => void;
  closeDateForm: () => void;
}

export const useLogStore = create<DateState>((set) => ({
  dates: [],
  stats: { totalDates: 0, uniqueCountries: 0, uniqueCities: 0, averageRating: null, averageFaceRating: null, averageBodyRating: null, averageChatRating: null, currentStreak: 0, longestStreak: 0 },
  selectedCountry: null,
  selectedCity: null,
  isDateFormOpen: false,
  setDates: (dates) => set({ dates }),
  addDate: (entry) =>
    set((state) => ({ dates: [entry, ...state.dates] })),
  removeDate: (id) =>
    set((state) => ({
      dates: state.dates.filter((e) => e.id !== id),
    })),
  updateDate: (id, updates) =>
    set((state) => ({
      dates: state.dates.map((e) =>
        e.id === id ? { ...e, ...updates } : e,
      ),
    })),
  setStats: (stats) => set({ stats }),
  setSelectedCountry: (code) => set({ selectedCountry: code }),
  setSelectedCity: (city) => set({ selectedCity: city }),
  openDateForm: () => set({ isDateFormOpen: true }),
  closeDateForm: () => set({ isDateFormOpen: false, selectedCity: null }),
}));
