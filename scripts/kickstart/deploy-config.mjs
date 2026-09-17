import { testEmailDeploymentAllowed } from "./environment.mjs";

// Report independent missing prerequisites together, before account discovery.
export function deploymentInputErrors(env, billingEnabled) {
  const errors = [];
  const tokens = ["GITHUB_TOKEN", "VERCEL_TOKEN"].filter(key => !env[key]?.trim());
  if (tokens.length) errors.push(`Fill deployment fields in .env: ${tokens.join(", ")}. See docs/DEPLOYMENT.md.`);
  if (billingEnabled) {
    for (const mode of ["TEST", "LIVE"]) {
      if (!new RegExp(`^[sr]k_${mode.toLowerCase()}_`).test(env[`STRIPE_${mode}_SECRET_KEY`] || "")) errors.push(`Fill STRIPE_${mode}_SECRET_KEY in .env with a Stripe ${mode.toLowerCase()} Secret key. ${mode === "LIVE" ? "The live account must be activated." : "The test catalog is the source for live products and prices."}`);
    }
  }
  if ((env.RESEND_TEST_MODE === "true" || env.RESEND_FROM_EMAIL === "onboarding@resend.dev") && !testEmailDeploymentAllowed(env)) errors.push("Verify your sending domain at https://resend.com/domains, set RESEND_FROM_EMAIL to an address on that domain, and set RESEND_TEST_MODE=false. For a temporary deployment limited to your Resend account email, explicitly set RESEND_ALLOW_TEST_DEPLOYMENT=true with RESEND_TEST_MODE=true.");
  else if (!env.RESEND_FROM_EMAIL?.trim()) errors.push("Fill RESEND_FROM_EMAIL with an address on your verified Resend domain.");
  return errors;
}

// Only this allowlist may leave the buyer's machine for the Next.js runtime.
export function productionEnvironment(env, billingEnabled) {
  const values = {
    APP_NAME: env.APP_NAME,
    APP_URL: env.APP_URL_LIVE,
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY,
    RESEND_API_KEY: env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL,
    RESEND_TEST_MODE: env.RESEND_TEST_MODE || "false",
    RESEND_TEMPLATE_WELCOME_ID: env.RESEND_TEMPLATE_WELCOME_ID,
    RESEND_TEMPLATE_WORKSPACE_INVITATION_ID: env.RESEND_TEMPLATE_WORKSPACE_INVITATION_ID,
    AUTH_EMAIL_VERIFICATION: env.AUTH_EMAIL_VERIFICATION || "false",
    SEO_INDEXABLE: env.SEO_INDEXABLE || "false",
    AI_ENABLED: env.AI_ENABLED || "false",
    CONTACT_TO_EMAIL: env.CONTACT_TO_EMAIL || "",
    AI_MODEL: env.AI_ENABLED === "true" ? env.AI_MODEL || "openai/gpt-4.1-mini" : "",
    OPENROUTER_API_KEY: env.AI_ENABLED === "true" ? env.OPENROUTER_API_KEY : "",
    STRIPE_LIVE_SECRET_KEY: billingEnabled ? env.STRIPE_LIVE_SECRET_KEY : "",
  };
  const sensitive = new Set(["SUPABASE_SECRET_KEY", "RESEND_API_KEY", "OPENROUTER_API_KEY", "STRIPE_LIVE_SECRET_KEY"]);
  return Object.entries(values).map(([key, value]) => ({ key, value: value || "", type: sensitive.has(key) ? "sensitive" : "plain", target: ["production"] }));
}

export function deploymentConfig(env) {
  const required = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO_NAME", "VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PROJECT_NAME", "APP_URL_LIVE"];
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Fill deployment fields in .env: ${missing.join(", ")}. See docs/DEPLOYMENT.md.`);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(env.GITHUB_OWNER) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(env.GITHUB_REPO_NAME)) throw new Error("Use a GitHub owner and repository name, not a URL.");
  if (!/^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$/.test(env.VERCEL_PROJECT_NAME) || env.VERCEL_PROJECT_NAME.includes("---")) throw new Error("VERCEL_PROJECT_NAME must be 2–100 lowercase letters, digits or hyphens, without three consecutive hyphens.");
  if (!/^team_[a-zA-Z0-9]+$/.test(env.VERCEL_TEAM_ID)) throw new Error("VERCEL_TEAM_ID must be the target team's team_... ID.");
  if (env.GITHUB_REPO_ID && !/^\d+$/.test(env.GITHUB_REPO_ID)) throw new Error("GITHUB_REPO_ID must be the generated numeric ID.");
  if (env.VERCEL_PROJECT_ID && !/^prj_[a-zA-Z0-9]+$/.test(env.VERCEL_PROJECT_ID)) throw new Error("VERCEL_PROJECT_ID must be the generated prj_... ID.");
  let origin;
  try {
    origin = new URL(env.APP_URL_LIVE);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || !origin.hostname.includes(".") || /^(localhost|127\.)/.test(origin.hostname)) throw new Error();
  } catch { throw new Error("APP_URL_LIVE must be a public HTTPS origin with no path, query, or credentials."); }
  if (env.APP_URL_LIVE !== origin.origin) throw new Error("Remove the trailing slash from APP_URL_LIVE.");
  if (env.RESEND_TEST_MODE === "true" && !testEmailDeploymentAllowed(env)) throw new Error("Deployment requires a verified sender or explicit RESEND_ALLOW_TEST_DEPLOYMENT=true for temporary account-only email testing.");
  if (!["true", "false"].includes(env.SEO_INDEXABLE || "false")) throw new Error("SEO_INDEXABLE must be true or false.");
  return { owner: env.GITHUB_OWNER, name: env.GITHUB_REPO_NAME, repo: `${env.GITHUB_OWNER}/${env.GITHUB_REPO_NAME}`, team: env.VERCEL_TEAM_ID, projectName: env.VERCEL_PROJECT_NAME, origin: origin.origin, domain: origin.hostname, branch: "main" };
}
