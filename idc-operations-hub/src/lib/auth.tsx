import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  API_UNAUTHORIZED_EVENT,
  ApiError,
  fetchCurrentUser,
  loginUser,
  logoutUser,
  type Employee,
} from "./api";

interface AuthContextValue {
  user: Employee | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<Employee>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<Employee | null>;
  syncUser: (user: Employee) => void;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetchCurrentUser();
      setUser(response.user);
      return response.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        return null;
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    let active = true;

    void fetchCurrentUser()
      .then((response) => {
        if (active) setUser(response.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    const handleUnauthorized = () => setUser(null);
    window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);

    return () => {
      active = false;
      window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const response = await loginUser(email, password);
    setUser(response.user);
    return response.user;
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        loading: isLoading,
        login,
        logout,
        refreshUser,
        syncUser: setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// The provider and its consumer hook intentionally share one auth module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
