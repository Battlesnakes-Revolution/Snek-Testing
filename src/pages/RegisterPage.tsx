import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    setIsLoading(true);
    const result = await register(email, password, username);
    setIsLoading(false);
    
    if (result.ok) {
      navigate("/dashboard");
    } else {
      setError(result.error ?? "Registration failed");
    }
  };

  return (
    <div className="min-h-screen bg-night flex items-center justify-center p-4">
      <div className="bg-ink border border-sand/20 rounded-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-sand mb-6">Create Account</h1>
        
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
            <label className="block text-sand/80 text-sm mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-night border border-sand/20 rounded px-3 py-2 text-sand focus:outline-none focus:border-lagoon"
              required
              minLength={2}
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
              minLength={6}
            />
          </div>
          
          <div>
            <label className="block text-sand/80 text-sm mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
            {isLoading ? "Creating account..." : "Create Account"}
          </button>
        </form>
        
        <p className="mt-4 text-sand/60 text-sm text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-lagoon hover:underline">
            Log in
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
