/**
 * PaywallScreen — "Pick your plan" upgrade flow.
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type PurchasesPackage, PACKAGE_TYPE } from 'react-native-purchases';
import { usePlanStore } from '@stores/planStore';
import { fetchOfferings, purchasePackage, restorePurchases } from '@services/purchaseService';
import { FONT, RADIUS, SPACING } from '@constants/theme';

const { width: SW } = Dimensions.get('window');

// ─── Colors ───────────────────────────────────────────────────────────────────

const BG_TOP    = '#0F0D24';
const BG_BOT    = '#080617';
const PURPLE    = '#7C3AED';
const BLUE      = '#3D6EF8';
const BLUE2     = '#1A4BDB';

// ─── Content ──────────────────────────────────────────────────────────────────

// FEATURES is built inside the component using t() so it re-renders on language change

// ─── Gem icon ─────────────────────────────────────────────────────────────────

function GemIcon() {
  return (
    <View style={styles.gemWrap}>
      <LinearGradient
        colors={['#E040FB', '#7C4DFF', '#40C4FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gemGrad}
      >
        <Ionicons name="diamond" size={36} color="#fff" />
      </LinearGradient>
    </View>
  );
}

// ─── Feature row ──────────────────────────────────────────────────────────────

function FeatureRow({ label }: { label: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureCheck}>
        <Ionicons name="checkmark" size={13} color="#fff" />
      </View>
      <Text style={styles.featureLabel}>{label}</Text>
    </View>
  );
}

// ─── Plan card ────────────────────────────────────────────────────────────────

interface PlanCardProps {
  label: string;
  price: string;
  sub?: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}

function PlanCard({ label, price, sub, badge, selected, onSelect }: PlanCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onSelect}
      style={[styles.planCard, selected && styles.planCardSelected]}
    >
      {/* Left — radio + labels */}
      <View style={styles.planLeft}>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioDot} />}
        </View>
        <View>
          <Text style={[styles.planLabel, selected && styles.planLabelSelected]}>
            {label}
          </Text>
          {sub ? <Text style={styles.planSub}>{sub}</Text> : null}
        </View>
      </View>

      {/* Right — badge + price */}
      <View style={styles.planRight}>
        {badge && (
          <LinearGradient
            colors={['#E040FB', PURPLE]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.badge}
          >
            <Text style={styles.badgeText}>{badge}</Text>
          </LinearGradient>
        )}
        <Text style={[styles.planPrice, selected && styles.planPriceSelected]}>
          {price}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

interface PaywallScreenProps {
  visible: boolean;
  onClose: () => void;
}

export default function PaywallScreen({ visible, onClose }: PaywallScreenProps) {
  const { t } = useTranslation();
  const { setPremium } = usePlanStore();

  const FEATURES = [
    t('paywall.feature1'),
    t('paywall.feature2'),
    t('paywall.feature3'),
    t('paywall.feature4'),
    t('paywall.feature5'),
  ];

  const [packages, setPackages]       = useState<PurchasesPackage[] | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<PurchasesPackage | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring,  setIsRestoring]  = useState(false);

  // Fallback plan data used when RC is unavailable
  const [selectedFallback, setSelectedFallback] = useState<'yearly' | 'monthly'>('yearly');

  useEffect(() => {
    if (!visible) return;
    setPackages(null);
    fetchOfferings().then((offerings) => {
      const pkgs = offerings?.current?.availablePackages ?? [];
      setPackages(pkgs);
      const annual = pkgs.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL);
      setSelectedPkg(annual ?? pkgs[0] ?? null);
    });
  }, [visible]);

  async function handleContinue() {
    if (isPurchasing) return;
    if (!selectedPkg) {
      // No RC packages — show an info alert
      Alert.alert(t('paywall.storeUnavailableTitle'), t('paywall.storeUnavailableMsg'));
      return;
    }
    setIsPurchasing(true);
    try {
      const result = await purchasePackage(selectedPkg);
      if (result.success) {
        await setPremium(true);
        onClose();
      } else if (!result.cancelled && result.error) {
        Alert.alert(t('paywall.purchaseFailedTitle'), result.error);
      }
    } finally {
      setIsPurchasing(false);
    }
  }

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
          t('paywall.noPurchasesTitle'),
          error ?? t('paywall.noPurchasesMsg'),
        );
      }
    } finally {
      setIsRestoring(false);
    }
  }

  // Derive display props from a RC package
  function pkgDisplay(pkg: PurchasesPackage): { label: string; price: string; sub?: string; badge?: string } {
    const isAnnual = pkg.packageType === PACKAGE_TYPE.ANNUAL;
    if (isAnnual) {
      const monthly = pkg.product.price / 12;
      return {
        label: t('paywall.planYearly'),
        price: pkg.product.priceString,
        sub:   t('paywall.planYearlySub', { price: `${pkg.product.currencyCode ?? ''}${monthly.toFixed(2)}` }),
        badge: t('paywall.bestValue'),
      };
    }
    return { label: t('paywall.planMonthly'), price: pkg.product.priceString };
  }

  const isLoading = packages === null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <LinearGradient
        colors={[BG_TOP, BG_BOT]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.75}>
          <View style={styles.closeBtnInner}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
          </View>
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Gem icon */}
          <GemIcon />

          {/* Title */}
          <Text style={styles.title}>{t('paywall.title')}</Text>

          {/* Features */}
          <View style={styles.featureList}>
            {FEATURES.map((f) => <FeatureRow key={f} label={f} />)}
          </View>

          {/* Plan cards */}
          <View style={styles.plans}>
            {isLoading ? (
              <ActivityIndicator color={PURPLE} style={{ marginVertical: 24 }} />
            ) : packages && packages.length > 0 ? (
              packages.map((pkg) => {
                const { label, price, sub, badge } = pkgDisplay(pkg);
                return (
                  <PlanCard
                    key={pkg.identifier}
                    label={label}
                    price={price}
                    sub={sub}
                    badge={badge}
                    selected={selectedPkg?.identifier === pkg.identifier}
                    onSelect={() => setSelectedPkg(pkg)}
                  />
                );
              })
            ) : (
              // Fallback when RC unavailable
              <>
                <PlanCard
                  label={t('paywall.planYearly')}
                  price="$19.99/yr"
                  sub={t('paywall.planYearlySub', { price: '$1.67' })}
                  badge={t('paywall.bestValue')}
                  selected={selectedFallback === 'yearly'}
                  onSelect={() => setSelectedFallback('yearly')}
                />
                <PlanCard
                  label={t('paywall.planMonthly')}
                  price="$2.99/mo"
                  selected={selectedFallback === 'monthly'}
                  onSelect={() => setSelectedFallback('monthly')}
                />
              </>
            )}
          </View>

          {/* Continue button */}
          <TouchableOpacity
            onPress={handleContinue}
            activeOpacity={0.88}
            disabled={isPurchasing}
            style={styles.continueBtn}
          >
            <LinearGradient
              colors={[BLUE, BLUE2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.continueBtnGrad}
            >
              {isPurchasing
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.continueBtnText}>{t('paywall.continueBtn')}</Text>
              }
            </LinearGradient>
          </TouchableOpacity>

          {/* Footer links */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleRestore} activeOpacity={0.7}>
              {isRestoring
                ? <ActivityIndicator size="small" color="rgba(255,255,255,0.35)" />
                : <Text style={styles.footerLink}>{t('paywall.restorePurchases')}</Text>
              }
            </TouchableOpacity>
            <Text style={styles.footerDot}>·</Text>
            <Text style={styles.footerLink}>{t('paywall.terms')}</Text>
            <Text style={styles.footerDot}>·</Text>
            <Text style={styles.footerLink}>{t('paywall.privacy')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },

  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    right: 20,
    zIndex: 10,
  },
  closeBtnInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 32,
  },

  // Gem
  gemWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#7C4DFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  gemGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Title
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800' as any,
    marginBottom: 24,
    letterSpacing: -0.3,
  },

  // Features
  featureList: {
    width: '100%',
    gap: 12,
    marginBottom: 28,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.medium as any,
    flex: 1,
  },

  // Plan cards
  plans: {
    width: '100%',
    gap: 10,
    marginBottom: 20,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 16,
  },
  planCardSelected: {
    backgroundColor: 'rgba(124,58,237,0.12)',
    borderColor: PURPLE,
  },
  planLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: PURPLE,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PURPLE,
  },
  planLabel: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.semibold as any,
  },
  planLabelSelected: {
    color: '#FFFFFF',
  },
  planSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: FONT.sizes.xs,
    marginTop: 2,
  },
  planRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  badge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700' as any,
  },
  planPrice: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: FONT.sizes.md,
    fontWeight: FONT.weights.bold as any,
  },
  planPriceSelected: {
    color: '#FFFFFF',
  },

  // Continue button
  continueBtn: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  continueBtnGrad: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: FONT.sizes.md,
    fontWeight: '700' as any,
    letterSpacing: 0.3,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerLink: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: FONT.sizes.xs,
  },
  footerDot: {
    color: 'rgba(255,255,255,0.20)',
    fontSize: FONT.sizes.xs,
  },
});
