import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { COLORS } from '@constants/theme';

// This call makes openAuthSessionAsync resolve on Android when the deep link
// brings the app back to the foreground. Navigation is handled by AuthGate.
WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackScreen() {
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
