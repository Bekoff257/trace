import React, { useState } from 'react';
import { usePlanStore } from '@stores/planStore';
import { isPremiumFeature, type PremiumFeature } from '@constants/features';
import PaywallScreen from '@components/ui/PaywallScreen';

export function usePremiumGate() {
  const { userPlan } = usePlanStore();
  const [visible, setVisible] = useState(false);

  /** Run callback if premium or feature is free, otherwise open paywall. */
  function gate(feature: PremiumFeature, callback: () => void) {
    if (userPlan === 'premium' || !isPremiumFeature(feature)) {
      callback();
    } else {
      setVisible(true);
    }
  }

  /** Directly open the paywall (for lock overlays, banners, etc.). */
  function showPaywall() {
    setVisible(true);
  }

  const paywallElement = React.createElement(PaywallScreen, {
    visible,
    onClose: () => setVisible(false),
  });

  return { gate, showPaywall, paywallElement };
}
