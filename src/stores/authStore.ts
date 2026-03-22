import { create } from 'zustand';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@services/supabaseClient';
import type { User } from '@/types/index';
import type { Session } from '@supabase/supabase-js';


interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  pendingEmailConfirmation: boolean;

  initialize: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
  setUsername: (username: string) => void;
  updateProfile: (updates: { displayName?: string; username?: string }) => void;
}

async function fetchUsername(userId: string): Promise<string | undefined> {
  const { data } = await supabase
    .from('user_profiles')
    .select('username')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.username ?? undefined;
}

// Map Supabase auth user to our User type
function mapSupabaseUser(supabaseUser: any): User {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    displayName:
      supabaseUser.user_metadata?.display_name ??
      supabaseUser.user_metadata?.full_name ??
      supabaseUser.email?.split('@')[0] ??
      'User',
    avatarUrl: supabaseUser.user_metadata?.avatar_url,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    trackingMode: 'always',
    createdAt: supabaseUser.created_at,
    updatedAt: supabaseUser.updated_at ?? supabaseUser.created_at,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  error: null,
  pendingEmailConfirmation: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const mappedUser = session?.user ? mapSupabaseUser(session.user) : null;

      const username = session?.user?.id ? await fetchUsername(session.user.id) : undefined;

      set({
        session,
        user: mappedUser ? { ...mappedUser, username } : null,
        isLoading: false,
      });

      supabase.auth.onAuthStateChange(async (_event, session) => {
        const mappedUser = session?.user ? mapSupabaseUser(session.user) : null;
        const username = session?.user?.id ? await fetchUsername(session.user.id) : undefined;
        set({
          session,
          user: mappedUser ? { ...mappedUser, username } : null,
          isLoading: false,
        });
      });
    } catch {
      set({ isLoading: false, error: 'Failed to initialize auth' });
    }
  },

  signInWithEmail: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const username = data.user?.id ? await fetchUsername(data.user.id) : undefined;
      set({
        session: data.session,
        user: data.user ? { ...mapSupabaseUser(data.user), username } : null,
        isLoading: false,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message ?? 'Sign in failed' });
    }
  },

  signUpWithEmail: async (email, password, displayName) => {
    set({ isLoading: true, error: null, pendingEmailConfirmation: false });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;

      // Supabase returns session=null when email confirmation is required
      if (data.user && !data.session) {
        set({ isLoading: false, pendingEmailConfirmation: true });
        return;
      }

      set({
        session: data.session,
        user: data.user ? mapSupabaseUser(data.user) : null,
        isLoading: false,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message ?? 'Sign up failed' });
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      const redirectTo = makeRedirectUri({ scheme: 'locationtracker', path: 'auth/callback' });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;

      // Open the OAuth URL — on Android the deep link handler in _layout.tsx
      // will call setSession when the redirect URL arrives, which fires
      // onAuthStateChange. We just need to wait for the browser to close.
      await WebBrowser.openAuthSessionAsync(data.url ?? '', redirectTo);

      // After browser closes, check the current session (covers all platforms/flows)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const username = await fetchUsername(session.user.id);
        set({
          session,
          user: { ...mapSupabaseUser(session.user), username },
          isLoading: false,
        });
      } else {
        // Browser was dismissed / cancelled — onAuthStateChange will handle
        // the session if the Linking handler fires later
        set({ isLoading: false });
      }
    } catch (err: any) {
      set({ isLoading: false, error: err.message ?? 'Google sign in failed' });
    }
  },

  signOut: async () => {
    // Clear local state immediately so the UI responds regardless of network
    set({ session: null, user: null, error: null, isLoading: false });
    supabase.auth.signOut().catch(() => {}); // best-effort server-side revoke
  },

  clearError: () => set({ error: null, pendingEmailConfirmation: false }),

  setUsername: (username) =>
    set((state) => ({
      user: state.user ? { ...state.user, username } : null,
    })),

  updateProfile: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),
}));
