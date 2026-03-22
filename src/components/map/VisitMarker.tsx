/**
 * VisitMarker — renders visit session locations as MapLibre markers.
 */
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Marker } from '@maplibre/maplibre-react-native';
import type { VisitSession } from '@/types/index';

const CATEGORY_COLORS: Record<VisitSession['placeCategory'], string> = {
  home:     '#5B7FFF',
  work:     '#00D4FF',
  food:     '#F7A74F',
  transit:  '#A074F7',
  fitness:  '#00E5A0',
  shopping: '#F774C4',
  nature:   '#00E5A0',
  other:    '#606080',
};

interface VisitMarkerProps {
  session: Pick<VisitSession, 'id' | 'lat' | 'lng' | 'placeCategory'>;
  onPress?: () => void;
}

export default function VisitMarker({ session, onPress }: VisitMarkerProps) {
  const color = CATEGORY_COLORS[session.placeCategory] ?? '#606080';

  return (
    <Marker
      id={`visit-${session.id}`}
      lngLat={[session.lng, session.lat]}
      anchor="center"
    >
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <View style={[styles.ring, { borderColor: color }]}>
          <View style={[styles.dot, { backgroundColor: color }]} />
        </View>
      </TouchableOpacity>
    </Marker>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2.5,
    backgroundColor: '#12121A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
