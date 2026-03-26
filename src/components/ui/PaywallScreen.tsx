/**
 * PaywallScreen — full-screen premium upgrade flow.
 *
 * Sections (top → bottom):
 *   1. Ambient background glows
 *   2. Close button
 *   3. Hero title + subtitle
 *   4. Horizontal snap-scroll feature cards (3D Replay, Heatmaps, Insights)
 *   5. Benefits list
 *   6. Pricing options (Yearly / Monthly)
 *   7. Sticky bottom CTA bar (BlurView)
 *
 * Animations:
 *   - Feature cards scale on press (Reanimated spring)
 *   - CTA button repeating pulse glow
 *   - Pricing option scale on select
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  FlatList,
  Alert,
  ActivityIndicator,
  ViewToken,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Circle, Rect, Defs, RadialGradient, Stop } from 'react-native-svg';
import { type PurchasesPackage, PACKAGE_TYPE } from 'react-native-purchases';
import { usePlanStore } from '@stores/planStore';
import { fetchOfferings, purchasePackage, restorePurchases } from '@services/purchaseService';
import { FONT, RADIUS, SPACING } from '@constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window');
const GOLD   = '#FACC15';
const PURPLE = '#7C3AED';
const BLUE   = '#38BDF8';
const BG     = '#09090C';

const CARD_H     = 200;
const CARD_W     = SW - 80;   // peek the next card
const CARD_GAP   = 14;
const SIDE_PAD   = 24;

// ─── Sub-components: card visuals ─────────────────────────────────────────────

function ReplayVisual() {
  return (
    <Svg width={CARD_W - 40} height={100} viewBox="0 0 260 100">
      <Defs>
        <RadialGradient id="rg" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={PURPLE} stopOpacity="0.5" />
          <Stop offset="100%" stopColor={PURPLE} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {/* Glow blob */}
      <Rect x="60" y="20" width="140" height="60" rx="30" fill="url(#rg)" />
      {/* Route path */}
      <Path
        d="M20,80 C50,80 50,50 80,50 C110,50 110,20 140,20 C170,20 170,60 200,60 C230,60 240,40 250,35"
        stroke={PURPLE}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity={0.9}
      />
      {/* Dots along route */}
      {([
        [20, 80], [80, 50], [140, 20], [200, 60], [250, 35],
      ] as [number, number][]).map(([cx, cy], i) => (
        <Circle key={i} cx={cx} cy={cy} r={i === 4 ? 5 : 3.5} fill={PURPLE} opacity={i === 4 ? 1 : 0.6} />
      ))}
      {/* Arrow head at end */}
      <Path d="M244,30 L252,35 L244,40" stroke={PURPLE} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function HeatmapVisual() {
  const COLS = 7;
  const ROWS = 4;
  const intensities = [
    [0.1, 0.3, 0.6, 0.9, 0.4, 0.2, 0.5],
    [0.4, 0.7, 1.0, 0.8, 0.6, 0.3, 0.1],
    [0.2, 0.5, 0.8, 1.0, 0.9, 0.5, 0.3],
    [0.1, 0.2, 0.4, 0.6, 0.3, 0.1, 0.0],
  ];
  const cellSize = 26;
  const gap = 5;
  const gridW = COLS * cellSize + (COLS - 1) * gap;
  const gridH = ROWS * cellSize + (ROWS - 1) * gap;

  return (
    <Svg width={gridW} height={gridH}>
      {intensities.map((row, r) =>
        row.map((intensity, c) => (
          <Rect
            key={`${r}-${c}`}
            x={c * (cellSize + gap)}
            y={r * (cellSize + gap)}
            width={cellSize}
            height={cellSize}
            rx={5}
            fill={GOLD}
            opacity={intensity}
          />
        )),
      )}
    </Svg>
  );
}

function InsightsVisual() {
  const bars = [
    { h: 45, label: 'Home' },
    { h: 70, label: 'Work' },
    { h: 30, label: 'Transit' },
    { h: 55, label: 'Food' },
    { h: 85, label: 'Other' },
  ];
  const maxH = 85;
  const barW = 28;
  const gap = 12;
  const totalW = bars.length * barW + (bars.length - 1) * gap;

  return (
    <Svg width={totalW} height={100} viewBox={`0 0 ${totalW} 100`}>
      {bars.map(({ h }, i) => (
        <React.Fragment key={i}>
          <Rect
            x={i * (barW + gap)}
            y={100 - h}
            width={barW}
            height={h}
            rx={6}
            fill={BLUE}
            opacity={0.35}
          />
          <Rect
            x={i * (barW + gap)}
            y={100 - h}
            width={barW}
            height={Math.min(h, 16)}
            rx={6}
            fill={BLUE}
            opacity={0.9}
          />
        </React.Fragment>
      ))}
    </Svg>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────

interface FeatureCardProps {
  title: string;
  subtitle: string;
  color: string;
  visual: 'replay' | 'heatmap' | 'insights';
}

function FeatureCard({ title, subtitle, color, visual }: FeatureCardProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function onPressIn() {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
  }
  function onPressOut() {
    scale.value = withSpring(1, { damping: 12, stiffness: 250 });
  }

  return (
    <Animated.View style={[{ width: CARD_W, height: CARD_H }, animStyle]}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.card}
      >
        <View style={[styles.cardGlow, { backgroundColor: color + '20' }]} />
        <View style={[styles.cardBorder, { borderColor: color + '30' }]} />

        {/* Visual */}
        <View style={styles.cardVisual}>
          {visual === 'replay'   && <ReplayVisual />}
          {visual === 'heatmap'  && <HeatmapVisual />}
          {visual === 'insights' && <InsightsVisual />}
        </View>

        {/* Labels */}
        <View style={styles.cardFooter}>
          <Text style={[styles.cardTitle, { color }]}>{title}</Text>
          <Text style={styles.cardSub}>{subtitle}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Benefit item ─────────────────────────────────────────────────────────────

function BenefitItem({ label }: { label: string }) {
  return (
    <View style={styles.benefitRow}>
      <View style={styles.benefitCheck}>
        <Ionicons name="checkmark" size={13} color={GOLD} />
      </View>
      <Text style={styles.benefitLabel}>{label}</Text>
    </View>
  );
}

// ─── Pricing option ───────────────────────────────────────────────────────────

interface PricingOptionProps {
  period: 'yearly' | 'monthly';
  price: string;
  sub: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}

function PricingOption({ period, price, sub, badge, selected, onSelect }: PricingOptionProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePress() {
    scale.value = withSequence(
      withSpring(0.97, { damping: 12, stiffness: 400 }),
      withSpring(1, { damping: 10, stiffness: 300 }),
    );
    onSelect();
  }

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity activeOpacity={0.9} onPress={handlePress} style={[
        styles.pricingOption,
        selected && styles.pricingOptionSelected,
      ]}>
        {selected && (
          <View style={styles.pricingSelectedBorder} />
        )}
        <View style={styles.pricingLeft}>
          <View style={[styles.pricingRadio, selected && styles.pricingRadioSelected]}>
            {selected && <View style={styles.pricingRadioDot} />}
          </View>
          <View>
            <Text style={styles.pricingPeriod}>
              {period === 'yearly' ? 'Yearly' : 'Monthly'}
            </Text>
            <Text style={styles.pricingSub}>{sub}</Text>
          </View>
        </View>
        <View style={styles.pricingRight}>
          {badge && (
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>{badge}</Text>
            </View>
          )}
          <Text style={[styles.pricingPrice, selected && { color: GOLD }]}>{price}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Sticky CTA ───────────────────────────────────────────────────────────────

interface StickyCTAProps {
  onUpgrade: () => void;
  onDismiss: () => void;
  isPurchasing?: boolean;
  disabled?: boolean;
}

function StickyCTA({ onUpgrade, onDismiss, isPurchasing, disabled }: StickyCTAProps) {
  const glow = useSharedValue(0.7);

  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.7, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <View style={styles.ctaContainer}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.ctaInner}>
        {/* Pulse glow behind button */}
        <Animated.View style={[styles.ctaGlow, glowStyle]} />

        <TouchableOpacity
          style={[styles.ctaBtn, (disabled || isPurchasing) && { opacity: 0.6 }]}
          onPress={onUpgrade}
          activeOpacity={0.88}
          disabled={disabled || isPurchasing}
        >
          <LinearGradient
            colors={['#FDE047', GOLD, '#F59E0B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaBtnGrad}
          >
            {isPurchasing ? (
              <ActivityIndicator size="small" color="#1a1100" />
            ) : (
              <>
                <Ionicons name="star" size={16} color="#1a1100" style={{ marginRight: 6 }} />
                <Text style={styles.ctaBtnText}>Unlock Premium</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={onDismiss} activeOpacity={0.7} style={styles.ctaFreeBtn}>
          <Text style={styles.ctaFreeText}>Continue with Free Version</Text>
        </TouchableOpacity>

        <View style={styles.ctaFooter}>
          <Ionicons name="lock-closed-outline" size={11} color="#505060" />
          <Text style={styles.ctaFooterText}>Secure payment</Text>
          <Text style={styles.ctaFooterDot}>{'\u00B7'}</Text>
          <Ionicons name="refresh-outline" size={11} color="#505060" />
          <Text style={styles.ctaFooterText}>Cancel anytime</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const FEATURE_CARDS = [
  { id: 'replay',   title: '3D Replay Mode',   subtitle: 'Relive your day step by step',       color: PURPLE, visual: 'replay'   },
  { id: 'heatmap',  title: 'Habit Heatmaps',   subtitle: 'See your patterns at a glance',      color: GOLD,   visual: 'heatmap'  },
  { id: 'insights', title: 'Deep Insights',    subtitle: 'Understand where your time goes',    color: BLUE,   visual: 'insights' },
] as const;

const BENEFITS = [
  'Unlimited historical replays',
  'Advanced habit analytics',
  'Custom life timelines',
  'Priority cloud syncing',
];

interface PaywallScreenProps {
  visible: boolean;
  onClose: () => void;
}

export default function PaywallScreen({ visible, onClose }: PaywallScreenProps) {
  const { setPremium } = usePlanStore();

  // RC packages: null = loading, [] = failed/unavailable
  const [packages, setPackages]   = useState<PurchasesPackage[] | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<PurchasesPackage | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring,  setIsRestoring]  = useState(false);

  // ── Load offerings when paywall opens ──────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setPackages(null);
    fetchOfferings().then((offerings) => {
      const pkgs = offerings?.current?.availablePackages ?? [];
      setPackages(pkgs);
      // Auto-select the annual package if available, otherwise first
      const annual = pkgs.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL);
      setSelectedPkg(annual ?? pkgs[0] ?? null);
    });
  }, [visible]);

  // ── Purchase ──────────────────────────────────────────────────────────────
  async function handleUpgrade() {
    if (!selectedPkg || isPurchasing) return;
    setIsPurchasing(true);
    try {
      const result = await purchasePackage(selectedPkg);
      if (result.success) {
        await setPremium(true);
        onClose();
      } else if (!result.cancelled && result.error) {
        Alert.alert('Purchase Failed', result.error);
      }
      // cancelled → silent, do nothing
    } finally {
      setIsPurchasing(false);
    }
  }

  // ── Restore ───────────────────────────────────────────────────────────────
  async function handleRestore() {
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      const { isPremium, error } = await restorePurchases();
      if (isPremium) {
        await setPremium(true);
        onClose();
      } else {
        Alert.alert(
          'No Purchases Found',
          error ?? 'We couldn\'t find any previous purchases linked to your account.',
        );
      }
    } finally {
      setIsRestoring(false);
    }
  }

  // ── Derive display info from RC package ───────────────────────────────────
  function getPkgDisplay(pkg: PurchasesPackage): { period: 'yearly' | 'monthly'; price: string; sub: string; badge?: string } {
    const isAnnual = pkg.packageType === PACKAGE_TYPE.ANNUAL;
    const price    = pkg.product.priceString;
    if (isAnnual) {
      const monthly = pkg.product.price / 12;
      const subText = `~${pkg.product.currencyCode ?? ''}${monthly.toFixed(2)} per month`;
      return { period: 'yearly', price, sub: subText, badge: 'Best Value' };
    }
    return { period: 'monthly', price, sub: 'Billed monthly' };
  }

  // ── Fallback pricing (shown while loading or if RC unavailable) ────────────
  const fallbackPackages = [
    { id: 'yearly',  period: 'yearly'  as const, price: '$19.99/yr', sub: '~$1.67 per month', badge: 'Best Value' },
    { id: 'monthly', period: 'monthly' as const, price: '$2.99/mo',  sub: 'Billed monthly' },
  ];

  const isLoading = packages === null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* ── Ambient glows ── */}
        <View style={[styles.ambientBlob, { top: -80, left: -60,  backgroundColor: PURPLE + '50', width: 240, height: 240 }]} />
        <View style={[styles.ambientBlob, { top: 120, right: -80, backgroundColor: GOLD   + '25', width: 200, height: 200 }]} />
        <View style={[styles.ambientBlob, { bottom: 180, left: 40, backgroundColor: BLUE  + '20', width: 160, height: 160 }]} />

        {/* ── Close button ── */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.75}>
          <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.75)" />
        </TouchableOpacity>

        {/* ── Scrollable content ── */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.crownWrap}>
              <LinearGradient colors={[GOLD, '#F59E0B']} style={styles.crownGrad}>
                <Text style={styles.crownEmoji}>👑</Text>
              </LinearGradient>
            </View>
            <Text style={styles.heroTitle}>Understand{'\n'}Your Life</Text>
            <Text style={styles.heroSub}>
              Replay your days, explore your habits, and unlock your full history.
            </Text>
          </View>

          {/* Feature cards — horizontal snap scroll */}
          <FlatList
            data={FEATURE_CARDS as unknown as typeof FEATURE_CARDS[number][]}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled={false}
            snapToInterval={CARD_W + CARD_GAP}
            snapToAlignment="start"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardsContent}
            renderItem={({ item }) => (
              <FeatureCard
                title={item.title}
                subtitle={item.subtitle}
                color={item.color}
                visual={item.visual as 'replay' | 'heatmap' | 'insights'}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
            style={styles.cardsList}
          />

          {/* Benefits */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Everything included</Text>
            <View style={styles.benefitsList}>
              {BENEFITS.map((b) => <BenefitItem key={b} label={b} />)}
            </View>
          </View>

          {/* Pricing */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Choose your plan</Text>
            {isLoading ? (
              <ActivityIndicator color={GOLD} style={{ marginTop: 16 }} />
            ) : packages && packages.length > 0 ? (
              <View style={styles.pricingList}>
                {packages.map((pkg) => {
                  const { period, price, sub, badge } = getPkgDisplay(pkg);
                  return (
                    <PricingOption
                      key={pkg.identifier}
                      period={period}
                      price={price}
                      sub={sub}
                      badge={badge}
                      selected={selectedPkg?.identifier === pkg.identifier}
                      onSelect={() => setSelectedPkg(pkg)}
                    />
                  );
                })}
              </View>
            ) : (
              // Fallback UI when RC is unavailable (no API key set or offline)
              <View style={styles.pricingList}>
                {fallbackPackages.map((p) => (
                  <PricingOption
                    key={p.id}
                    period={p.period}
                    price={p.price}
                    sub={p.sub}
                    badge={p.badge}
                    selected={false}
                    onSelect={() => {}}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Restore purchases link */}
          <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} style={styles.restoreBtn}>
            {isRestoring
              ? <ActivityIndicator size="small" color="rgba(255,255,255,0.35)" />
              : <Text style={styles.restoreText}>Restore Purchases</Text>
            }
          </TouchableOpacity>

          {/* Bottom spacing so sticky bar doesn't cover content */}
          <View style={{ height: 160 }} />
        </ScrollView>

        {/* ── Sticky CTA ── */}
        <StickyCTA
          onUpgrade={handleUpgrade}
          onDismiss={onClose}
          isPurchasing={isPurchasing}
          disabled={!selectedPkg || isLoading}
        />
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },

  // Ambient blobs
  ambientBlob: {
    position: 'absolute',
    borderRadius: 999,
    // blurRadius not supported on RN natively — opacity + large radius achieves the glow feel
    opacity: 0.6,
  },

  // Close
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 40,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: Platform.OS === 'ios' ? 100 : 80,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingHorizontal: SIDE_PAD,
    marginBottom: 32,
  },
  crownWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 12,
  },
  crownGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crownEmoji: {
    fontSize: 28,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: FONT.sizes.display,
    fontWeight: FONT.weights.black,
    textAlign: 'center',
    lineHeight: FONT.sizes.display * 1.15,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FONT.sizes.md,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Cards
  cardsList: {
    marginBottom: 32,
  },
  cardsContent: {
    paddingHorizontal: SIDE_PAD,
  },
  card: {
    height: CARD_H,
    width: CARD_W,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    padding: 20,
    justifyContent: 'space-between',
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.xl,
  },
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
  },
  cardVisual: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFooter: {
    gap: 2,
  },
  cardTitle: {
    fontSize: FONT.sizes.lg,
    fontWeight: FONT.weights.bold,
  },
  cardSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FONT.sizes.sm,
  },

  // Section
  section: {
    paddingHorizontal: SIDE_PAD,
    marginBottom: 28,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.semibold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 14,
  },

  // Benefits
  benefitsList: {
    gap: 10,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GOLD + '20',
    borderWidth: 1,
    borderColor: GOLD + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitLabel: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.medium,
  },

  // Pricing
  pricingList: {
    gap: 10,
  },
  pricingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: RADIUS.md,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  pricingOptionSelected: {
    backgroundColor: GOLD + '10',
    borderColor: GOLD + '40',
  },
  pricingSelectedBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: GOLD + '60',
  },
  pricingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pricingRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pricingRadioSelected: {
    borderColor: GOLD,
  },
  pricingRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GOLD,
  },
  pricingPeriod: {
    color: '#FFFFFF',
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.semibold,
  },
  pricingSub: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: FONT.sizes.xs,
    marginTop: 1,
  },
  pricingRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  pricingPrice: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.bold,
  },
  saveBadge: {
    backgroundColor: GOLD + '20',
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: GOLD + '50',
  },
  saveBadgeText: {
    color: GOLD,
    fontSize: FONT.sizes.xs,
    fontWeight: FONT.weights.bold,
  },

  // Sticky CTA
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  ctaInner: {
    paddingHorizontal: SIDE_PAD,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    alignItems: 'center',
    gap: 10,
  },
  ctaGlow: {
    position: 'absolute',
    top: -20,
    left: SW / 2 - 80,
    width: 160,
    height: 60,
    borderRadius: 80,
    backgroundColor: GOLD + '30',
  },
  ctaBtn: {
    width: '100%',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  ctaBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  ctaBtnText: {
    color: '#1a1100',
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.black,
    letterSpacing: 0.3,
  },
  ctaFreeBtn: {
    paddingVertical: 4,
  },
  ctaFreeText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: FONT.sizes.sm,
  },
  ctaFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  ctaFooterText: {
    color: '#505060',
    fontSize: FONT.sizes.xs,
  },
  ctaFooterDot: {
    color: '#303040',
    fontSize: FONT.sizes.md,
  },

  // Restore
  restoreBtn: {
    alignSelf: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  restoreText: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: FONT.sizes.sm,
    textDecorationLine: 'underline',
  },
});
