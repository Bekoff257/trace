import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@services/supabaseClient';
import { COLORS } from '@constants/theme';


WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackScreen() {
  useEffect(() => {

    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          router.replace('/(tabs)');
        } else {
          router.replace('/(auth)/login');
        }
      });
    }, 500);
    return () => clearTimeout(timer);
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
