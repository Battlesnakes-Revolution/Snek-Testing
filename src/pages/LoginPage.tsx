import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: { theme: string; size: string; width: number }
          ) => void;
        };
      };
    };
  }
}

function parseJwt(token: string) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  return JSON.parse(jsonPayload);
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login, googleSignIn } = useAuth();
  const navigate = useNavigate();

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId) return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleGoogleCallback,
        });
        const buttonDiv = document.getElementById("google-signin-button");
        if (buttonDiv) {
          window.google.accounts.id.renderButton(buttonDiv, {
            theme: "outline",
            size: "large",
            width: 320,
          });
        }
      }
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [googleClientId]);

  const handleGoogleCallback = async (response: { credential: string }) => {
    setError(null);
    setIsLoading(true);
    try {
      const payload = parseJwt(response.credential);
      const result = await googleSignIn(payload.sub, payload.email, payload.name);
      if (result.ok) {
        navigate("/dashboard");
      } else {
        setError(result.error ?? "Google sign-in failed");
      }
    } catch {
      setError("Failed to process Google sign-in");
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    
    const result = await login(email, password);
    setIsLoading(false);
    
    if (result.ok) {
      navigate("/dashboard");
    } else {
      setError(result.error ?? "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-night flex items-center justify-center p-4">
      <div className="bg-ink border border-sand/20 rounded-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-sand mb-6">Log In</h1>
        
        {googleClientId && (
          <>
            <div id="google-signin-button" className="flex justify-center mb-4"></div>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-sand/20"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-ink text-sand/60">or continue with email</span>
              </div>
            </div>
          </>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sand/80 text-sm mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-night border border-sand/20 rounded px-3 py-2 text-sand focus:outline-none focus:border-lagoon"
              required
            />
          </div>
          
          <div>
            <label className="block text-sand/80 text-sm mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-night border border-sand/20 rounded px-3 py-2 text-sand focus:outline-none focus:border-lagoon"
              required
            />
          </div>
          
          {error && (
            <p className="text-ember text-sm">{error}</p>
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-lagoon text-ink font-semibold py-2 px-4 rounded hover:bg-lagoon/80 disabled:opacity-50"
          >
            {isLoading ? "Logging in..." : "Log In"}
          </button>
        </form>
        
        <p className="mt-4 text-sand/60 text-sm text-center">
          <Link to="/" className="text-sand/60 hover:text-sand">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
