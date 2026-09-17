// Local .env can hold both modes for setup. Test wins when both secret keys
// exist; production receives only its live secret key. NODE_ENV never selects
// live billing (local production builds must remain safe to test).
export function billingMode(env = process.env) {
  return env.STRIPE_TEST_SECRET_KEY || !env.STRIPE_LIVE_SECRET_KEY ? "test" : "live";
}
