import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Film, Loader2, Eye, EyeOff } from 'lucide-react';

const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

export const AuthScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const validateFields = (): boolean => {
    const errors: { username?: string; password?: string } = {};

    if (!isLogin) {
      if (username.length < 3) errors.username = 'Must be at least 3 characters';
      else if (username.length > 30) errors.username = 'Must be at most 30 characters';
      else if (!USERNAME_REGEX.test(username)) errors.username = 'Letters, numbers, and underscores only';
      if (password.length < 8) errors.password = 'Must be at least 8 characters';
    } else {
      if (!username.trim()) errors.username = 'Username is required';
      if (!password) errors.password = 'Password is required';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateFields()) return;

    setLoading(true);
    try {
      if (isLogin) {
        await signIn(username.trim(), password);
      } else {
        await signUp(username.trim(), password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setFieldErrors({});
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-zinc-900 p-8 rounded-[32px] border border-white/10 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-4 border border-emerald-500/20">
            <Film size={32} />
          </div>
          <h1 className="text-3xl font-display italic tracking-wide">CineSwipe</h1>
          <p className="text-zinc-400 text-sm mt-2">
            {isLogin ? 'Welcome back to your watchlist' : 'Create an account to start swiping'}
          </p>
        </div>

        {error && (
          <div role="alert" className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl mb-6 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="username" className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (fieldErrors.username) setFieldErrors(prev => ({ ...prev, username: undefined }));
              }}
              className={`w-full bg-black border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors ${
                fieldErrors.username ? 'border-rose-500/60' : 'border-white/10'
              }`}
              placeholder={isLogin ? 'Your username' : '3–30 characters, letters/numbers/_'}
              aria-describedby={fieldErrors.username ? 'username-error' : undefined}
            />
            {fieldErrors.username && (
              <p id="username-error" className="text-rose-400 text-xs mt-1.5 ml-1">{fieldErrors.username}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: undefined }));
                }}
                className={`w-full bg-black border rounded-xl px-4 py-3 pr-12 text-white focus:outline-none focus:border-emerald-500 transition-colors ${
                  fieldErrors.password ? 'border-rose-500/60' : 'border-white/10'
                }`}
                placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password && (
              <p id="password-error" className="text-rose-400 text-xs mt-1.5 ml-1">{fieldErrors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center mt-6"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={switchMode}
            className="text-zinc-400 hover:text-white text-sm transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};
