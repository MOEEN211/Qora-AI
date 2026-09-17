// Development and deployment share the buyer's Supabase project and Resend
// templates. Only the application origin changes for deploy kickstart; Stripe
// selects its own live credentials independently.
export const testEmailDeploymentAllowed = env => env.RESEND_TEST_MODE === "true" && env.RESEND_ALLOW_TEST_DEPLOYMENT === "true";

export function setupEnvironment(env, deploy = false) {
  return { ...env, ...(deploy ? { APP_URL: env.APP_URL_LIVE } : {}) };
}
