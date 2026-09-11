import { create } from "zustand";

import { api, type Branch, type Session } from "@/lib/api";

interface AppStore {
  session: Session | null;
  branches: Branch[];
  selectedBranchId: string | null;
  isBootstrapping: boolean;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectBranch: (branchId: string) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  session: null,
  branches: [],
  selectedBranchId: null,
  isBootstrapping: true,

  bootstrap: async () => {
    const [session, branches] = await Promise.all([
      api.getSession(),
      api.listBranches(),
    ]);
    set({
      session,
      branches,
      selectedBranchId: branches[0]?.id ?? null,
      isBootstrapping: false,
    });
  },

  login: async (email, password) => {
    const session = await api.login(email, password);
    const branches = await api.listBranches();
    set({ session, branches, selectedBranchId: branches[0]?.id ?? null });
  },

  logout: async () => {
    await api.logout();
    set({ session: null });
  },

  selectBranch: (branchId) => {
    if (get().branches.some((b) => b.id === branchId)) {
      set({ selectedBranchId: branchId });
    }
  },
}));
