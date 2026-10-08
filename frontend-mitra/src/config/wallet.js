import { Capacitor } from '@capacitor/core';

// Withdrawals and the WiraPay/tips balance are only offered on the web
// (mitra.wira.one). Google Play only lets organisation developer accounts
// publish apps with wallet features, so the Android app keeps earnings and
// "Setor Komisi" (paying Wira its commission) but not "Tarik Saldo".
export const WALLET_ENABLED = !Capacitor.isNativePlatform();
