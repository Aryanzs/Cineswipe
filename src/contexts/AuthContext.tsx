import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  username: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Converts a username to a fake email Supabase can store
const toEmail = (username: string) => `${username.toLowerCase()}@cineswipe.app`;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string): Promise<string | null> => {
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('user_id', userId)
      .single();
    return data?.username ?? null;
  };

  useEffect(() => {
    // getSession() reliably resolves the initial session even when the access
    // token is expired and needs a refresh — avoids infinite loading on reopen.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        if (session?.user) {
          const username = await loadProfile(session.user.id);
          if (username) setUser({ id: session.user.id, username });
        }
      } catch {
        // Profile load failed — stay logged out
      } finally {
        setLoading(false);
      }
    });

    // onAuthStateChange handles SUBSEQUENT events only: login, logout, token refresh.
    // It does NOT control the loading state — getSession handles that.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          if (session?.user) {
            const username = await loadProfile(session.user.id);
            if (username) setUser({ id: session.user.id, username });
            else setUser(null);
          } else {
            setUser(null);
          }
        } catch {
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (username: string, password: string) => {
    // Check if username is already taken before creating auth user
    const { data: existing } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .maybeSingle();

    if (existing) throw new Error('Username already taken');

    const { data, error } = await supabase.auth.signUp({
      email: toEmail(username),
      password,
    });

    if (error) throw new Error(error.message);
    if (!data.user) throw new Error('Registration failed');

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ user_id: data.user.id, username });

    if (profileError) throw new Error('Failed to save username');

    setUser({ id: data.user.id, username });
  };

  const signIn = async (username: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: toEmail(username),
      password,
    });
    if (error) throw new Error('Invalid username or password');
    // User state is set via onAuthStateChange listener
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
