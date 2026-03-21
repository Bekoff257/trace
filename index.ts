// Patch AnimatedNode.__callListeners to guard against undefined _listeners.
// This is a known RN 0.83 New Architecture bug where _listeners gets cleared
// before an in-flight animation callback fires. Safe to remove once rebuilt
// with newArchEnabled=false.
(function patchAnimatedNode() {
  try {
    const AnimatedNode =
      require('react-native/Libraries/Animated/nodes/AnimatedNode').default ??
      require('react-native/Libraries/Animated/nodes/AnimatedNode');
    const proto = AnimatedNode.prototype;
    const orig = proto.__callListeners;
    if (orig) {
      proto.__callListeners = function patchedCallListeners(value: number) {
        if (!this._listeners || typeof this._listeners.forEach !== 'function') return;
        orig.call(this, value);
      };
    }
  } catch (_) {}
})();

import 'expo-router/entry';
