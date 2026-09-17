import { Webhook } from "npm:standardwebhooks@1.0.0";
import { createEmailHook } from "./handler.mjs";

const env = Deno.env.toObject();
const webhook = new Webhook(env.FORMA_EMAIL_HOOK_SECRET.replace(/^v1,whsec_/, ""));
Deno.serve(createEmailHook({ env, verify: (body, headers) => webhook.verify(body, headers) }));
