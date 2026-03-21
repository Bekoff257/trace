import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@constants/theme';

type IconName = 'home' | 'timeline' | 'map' | 'history' | 'profile';

interface TabBarIconProps {
  name: IconName;
  color: string;
  focused: boolean;
}

const ICONS: Record<IconName, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  home:     { active: 'home',           inactive: 'home-outline' },
  timeline: { active: 'time',           inactive: 'time-outline' },
  map:      { active: 'map',            inactive: 'map-outline' },
  history:  { active: 'calendar',       inactive: 'calendar-outline' },
  profile:  { active: 'person-circle',  inactive: 'person-circle-outline' },
};

export default function TabBarIcon({ name, color, focused }: TabBarIconProps) {
  const icon = ICONS[name];
  return (
    <View style={[styles.container, focused && styles.focused]}>
      <Ionicons
        name={focused ? icon.active : icon.inactive}
        size={22}
        color={color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  focused: {
    backgroundColor: COLORS.primaryGlow,
  },
});
