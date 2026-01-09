import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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
          Don't have an account?{" "}
          <Link to="/register" className="text-lagoon hover:underline">
            Sign up
          </Link>
        </p>
        
        <p className="mt-2 text-sand/60 text-sm text-center">
          <Link to="/" className="text-sand/60 hover:text-sand">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
