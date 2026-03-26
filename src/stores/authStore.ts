import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from '@services/supabaseClient';
import { useLocationStore } from '@stores/locationStore';
import { resetDetector } from '@services/visitDetector';
import { closeUserDB } from '@services/localDB';
import type { User } from '@/types/index';
import type { Session } from '@supabase/supabase-js';

// ─── Auth-state subscription (module-level so initialize() can replace it) ───
let _authSubscription: { unsubscribe: () => void } | null = null;

// ─── Google Sign-In configuration ────────────────────────────────────────────
// webClientId: OAuth 2.0 "Web application" client ID from Google Cloud Console.
// It must match the client ID registered in your Supabase project's
// Authentication → Providers → Google settings.
// Replace the placeholder below with your actual client ID.
GoogleSignin.configure({
  webClientId: '701703707394-2venplcj3c0rb7sdp0himvmdal08hi19.apps.googleusercontent.com',
  offlineAccess: false,
});



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
  const cacheKey = `username_${userId}`;
  try {
    const { data } = await supabase
      .from('user_profiles')
      .select('username')
      .eq('user_id', userId)
      .maybeSingle();
    const username: string | undefined = data?.username ?? undefined;
    if (username) AsyncStorage.setItem(cacheKey, username).catch(() => {});
    return username;
  } catch {
    // Network offline — fall back to cached value so we don't redirect to username setup
    const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
    return cached ?? undefined;
  }
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

      // Remove any previous listener before registering a new one.
      // initialize() can be called more than once (e.g. in dev Strict Mode),
      // and stacking listeners causes duplicate state-sets and redirect loops.
      _authSubscription?.unsubscribe();
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        // INITIAL_SESSION is handled by initialize() above.
        // SIGNED_OUT is handled synchronously by signOut() — skipping it
        // prevents a race where the async supabase.auth.signOut() fires its
        // event AFTER a new Google sign-in has already started, resetting
        // session/user mid-login and causing a redirect loop.
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') return;

        const mappedUser = session?.user ? mapSupabaseUser(session.user) : null;
        const username = session?.user?.id ? await fetchUsername(session.user.id) : undefined;
        set({
          session,
          user: mappedUser ? { ...mappedUser, username } : null,
          isLoading: false,
        });
      });
      _authSubscription = subscription;
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
      // Ensure Google Play Services are available (Android only — no-op on iOS)
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Opens the native Google account picker — no browser, no deep links
      const response = await GoogleSignin.signIn();

      if (!isSuccessResponse(response)) {
        // User dismissed the picker without selecting an account
        set({ isLoading: false });
        return;
      }

      const idToken = response.data.idToken;
      if (!idToken) throw new Error('Google Sign-In returned no ID token');

      // Exchange the Google ID token for a Supabase session
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) throw error;

      const username = data.user?.id ? await fetchUsername(data.user.id) : undefined;
      set({
        session: data.session,
        user: data.user ? { ...mapSupabaseUser(data.user), username } : null,
        isLoading: false,
      });
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
        // User cancelled — not an error worth showing
        set({ isLoading: false });
      } else {
        set({ isLoading: false, error: err.message ?? 'Google sign in failed' });
      }
    }
  },

  signOut: async () => {
    // Clear local state immediately so the UI responds regardless of network
    set({ session: null, user: null, error: null, isLoading: false });
    // Clear location data and close the user's DB so a new account starts fresh
    useLocationStore.getState().clearPoints();
    resetDetector();
    closeUserDB().catch(() => {});
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
