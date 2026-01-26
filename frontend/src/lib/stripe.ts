import { loadStripe } from '@stripe/stripe-js';

// Get Stripe publishable key from environment
const stripePublishableKey = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;

if (!stripePublishableKey) {
  console.warn('[Stripe] No publishable key found. Set PUBLIC_STRIPE_PUBLISHABLE_KEY in .env');
}

// Initialize Stripe - this is cached by the library
export const stripePromise = stripePublishableKey 
  ? loadStripe(stripePublishableKey)
  : null;
