import { Capacitor } from '@capacitor/core';

// WiraPay (stored balance, top-up, transfers, tips, project escrow) is only
// offered on the web. Google Play only lets organisation developer accounts
// publish apps with wallet features, so the Android app sticks to cash and
// per-order QRIS. Orders paid with WiraPay on the web still work everywhere.
export const WALLET_ENABLED = !Capacitor.isNativePlatform();
