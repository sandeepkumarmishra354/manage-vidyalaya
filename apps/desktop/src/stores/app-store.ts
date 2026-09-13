import { create } from "zustand";

import { api, type Branch, type ModuleKey, type Session } from "@/lib/api";

interface AppStore {
  session: Session | null;
  branches: Branch[];
  selectedBranchId: string | null;
  isBootstrapping: boolean;
  /** Modules disabled for the currently selected branch (enabled unless listed here). */
  disabledModules: Set<ModuleKey>;
  /** The current user's effective permission set (union across their roles). */
  permissions: Set<string>;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  selectBranch: (branchId: string) => void;
  refreshModuleSettings: () => Promise<void>;
  isModuleEnabled: (key: ModuleKey) => boolean;
  hasPermission: (key: string) => boolean;
}

async function loadDisabledModules(branchId: string | null): Promise<Set<ModuleKey>> {
  if (!branchId) return new Set();
  const settings = await api.getModuleSettings(branchId);
  return new Set(settings.filter((s) => !s.is_enabled).map((s) => s.module_key));
}

async function loadPermissions(session: Session | null): Promise<Set<string>> {
  if (!session) return new Set();
  const keys = await api.listMyPermissions();
  return new Set(keys);
}

export const useAppStore = create<AppStore>((set, get) => ({
  session: null,
  branches: [],
  selectedBranchId: null,
  isBootstrapping: true,
  disabledModules: new Set(),
  permissions: new Set(),

  bootstrap: async () => {
    const [session, branches] = await Promise.all([
      api.getSession(),
      api.listBranches(),
    ]);
    const selectedBranchId = branches[0]?.id ?? null;
    const [disabledModules, permissions] = await Promise.all([
      loadDisabledModules(selectedBranchId),
      loadPermissions(session),
    ]);
    set({ session, branches, selectedBranchId, disabledModules, permissions, isBootstrapping: false });
  },

  login: async (email, password) => {
    const session = await api.login(email, password);
    const branches = await api.listBranches();
    const selectedBranchId = branches[0]?.id ?? null;
    const [disabledModules, permissions] = await Promise.all([
      loadDisabledModules(selectedBranchId),
      loadPermissions(session),
    ]);
    set({ session, branches, selectedBranchId, disabledModules, permissions });
  },

  logout: async () => {
    await api.logout();
    set({ session: null, permissions: new Set() });
  },

  selectBranch: (branchId) => {
    if (get().branches.some((b) => b.id === branchId)) {
      set({ selectedBranchId: branchId });
      loadDisabledModules(branchId).then((disabledModules) => set({ disabledModules }));
    }
  },

  refreshModuleSettings: async () => {
    const disabledModules = await loadDisabledModules(get().selectedBranchId);
    set({ disabledModules });
  },

  isModuleEnabled: (key) => !get().disabledModules.has(key),
  hasPermission: (key) => get().permissions.has(key),
}));
