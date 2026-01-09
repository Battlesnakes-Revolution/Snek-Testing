import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type User = {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (email: string, password: string, username: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

function getClientId(): string {
  let clientId = localStorage.getItem("clientId");
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem("clientId", clientId);
  }
  return clientId;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("userToken"));
  const [isLoading, setIsLoading] = useState(true);

  const loginMutation = useMutation(api.auth.login);
  const registerMutation = useMutation(api.auth.register);
  const logoutMutation = useMutation(api.auth.logout);
  const currentUser = useQuery(api.auth.getCurrentUser, token ? { token } : "skip");

  useEffect(() => {
    if (currentUser !== undefined) {
      setIsLoading(false);
    }
  }, [currentUser]);

  const login = async (email: string, password: string) => {
    const result = await loginMutation({ email, password, clientId: getClientId() });
    if (result.ok && result.token) {
      localStorage.setItem("userToken", result.token);
      setToken(result.token);
      return { ok: true };
    }
    return { ok: false, error: result.error };
  };

  const register = async (email: string, password: string, username: string) => {
    const result = await registerMutation({ email, password, username, clientId: getClientId() });
    if (result.ok && result.token) {
      localStorage.setItem("userToken", result.token);
      setToken(result.token);
      return { ok: true };
    }
    return { ok: false, error: result.error };
  };

  const logout = async () => {
    if (token) {
      await logoutMutation({ token });
    }
    localStorage.removeItem("userToken");
    setToken(null);
  };

  const user = currentUser ?? null;

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
