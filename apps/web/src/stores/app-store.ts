import { create } from "zustand";

import { api, type Branch, type CurrentUser, type ModuleKey } from "@/lib/api";
import { clearTokens, getAccessToken, setTokens, setUnauthorizedHandler } from "@/lib/http";

interface AppStore {
  session: CurrentUser | null;
  branches: Branch[];
  selectedBranchId: string | null;
  isBootstrapping: boolean;
  /** Modules disabled for the currently selected branch (enabled unless listed here). */
  disabledModules: Set<ModuleKey>;
  /** The current user's effective permission set (union across their roles). */
  permissions: Set<string>;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  selectBranch: (branchId: string) => void;
  refreshModuleSettings: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  isModuleEnabled: (key: ModuleKey) => boolean;
  hasPermission: (key: string) => boolean;
}

async function loadDisabledModules(branchId: string | null): Promise<Set<ModuleKey>> {
  if (!branchId) return new Set();
  const settings = await api.getModuleSettings(branchId);
  return new Set(settings.filter((s) => !s.is_enabled).map((s) => s.module_key));
}

function clearSessionState(set: (partial: Partial<AppStore>) => void) {
  set({
    session: null,
    branches: [],
    selectedBranchId: null,
    permissions: new Set(),
    disabledModules: new Set(),
  });
}

export const useAppStore = create<AppStore>((set, get) => ({
  session: null,
  branches: [],
  selectedBranchId: null,
  isBootstrapping: true,
  disabledModules: new Set(),
  permissions: new Set(),

  bootstrap: async () => {
    // Fires whenever a request can't be recovered by refreshing the access
    // token (expired/invalid refresh token) -- drops back to a logged-out
    // state so the router redirects to /login.
    setUnauthorizedHandler(() => clearSessionState(set));

    if (!getAccessToken()) {
      set({ isBootstrapping: false });
      return;
    }

    try {
      const me = await api.me();
      const selectedBranchId = me.branches[0]?.id ?? null;
      const disabledModules = await loadDisabledModules(selectedBranchId);
      set({
        session: me.user,
        branches: me.branches,
        selectedBranchId,
        permissions: new Set(me.permissions),
        disabledModules,
        isBootstrapping: false,
      });
    } catch {
      clearTokens();
      set({ isBootstrapping: false });
    }
  },

  login: async (email, password) => {
    const result = await api.login(email, password);
    setTokens(result.access_token, result.refresh_token);

    const me = await api.me();
    const selectedBranchId = me.branches[0]?.id ?? null;
    const disabledModules = await loadDisabledModules(selectedBranchId);
    set({
      session: me.user,
      branches: me.branches,
      selectedBranchId,
      permissions: new Set(me.permissions),
      disabledModules,
    });
  },

  logout: () => {
    clearTokens();
    clearSessionState(set);
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

  refreshBranches: async () => {
    const branches = await api.listBranches();
    set({ branches });
  },

  isModuleEnabled: (key) => !get().disabledModules.has(key),
  hasPermission: (key) => get().permissions.has(key),
}));
