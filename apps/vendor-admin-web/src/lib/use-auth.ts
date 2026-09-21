import { useCallback, useEffect, useState } from "react";

import { api, type VendorAdmin } from "./api";
import { clearToken, getToken } from "./http";

type AuthState = { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; admin: VendorAdmin };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setState({ status: "signed-out" });
      return;
    }
    try {
      const admin = await api.me();
      setState({ status: "signed-in", admin });
    } catch {
      setState({ status: "signed-out" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(() => {
    clearToken();
    setState({ status: "signed-out" });
  }, []);

  return { state, refresh, logout };
}
