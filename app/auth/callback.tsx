import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@services/supabaseClient';
import { COLORS } from '@constants/theme';

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<Record<string, string>>();

  useEffect(() => {
    const access_token = params.access_token;
    const refresh_token = params.refresh_token;

    if (access_token && refresh_token) {
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(() => router.replace('/(tabs)'))
        .catch(() => router.replace('/(auth)/login'));
    } else {
      router.replace('/(auth)/login');
    }
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={COLORS.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
