import { Capacitor } from '@capacitor/core';
import { supabase } from '../config/supabase';

// Email confirmation (Supabase Auth "Confirm email"). The link in the email
// opens this app's sign-in page. Inside the Android app the page origin is
// https://localhost, which a phone's mail app cannot open, so the public
// site is used there. The address must be in Supabase Auth > URL
// Configuration > Redirect URLs.
export const confirmRedirect = () =>
  `${Capacitor.isNativePlatform() ? 'https://wira.one' : window.location.origin}/login`;

/** Supabase refused a sign-in because the address is not confirmed yet. */
export const isEmailNotConfirmed = (err) =>
  err?.code === 'email_not_confirmed' || /email not confirmed/i.test(String(err?.message || ''));

/** Sends the confirmation email again. Throws on failure (e.g. rate limit). */
export async function resendConfirmation(email) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: confirmRedirect() },
  });
  if (error) throw error;
}
