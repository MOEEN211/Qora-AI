/** Marketing copy. Pricing reads the shared application billing catalog. */
export const marketing = {
  title: "Build your SaaS. Skip the boilerplate.",
  description:
    "A Next.js SaaS starter with authentication, team workspaces, Stripe billing, and a customizable UI. Connect your services and focus on the features your customers need.",
  navigation: [
    { label: "Product", href: "/#product" },
    { label: "Pricing", href: "/pricing" },
    { label: "FAQs", href: "/faq" },
    { label: "Contact", href: "/contact" },
    { label: "Docs", href: "/docs" },
    { label: "Blog", href: "/blog" },
  ],
  faqs: [
    {
      question: "What exactly is Qora.ai?",
      answer:
        "Qora.ai is a modern SaaS platform with AI-enhanced workflows, team workspaces, Stripe subscription billing, and a sleek, customizable interface. You get complete source code and rapid setup documentation to build and launch your product effortlessly.",
    },
    {
      question: "Do I need to know how to code?",
      answer:
        "Basic development experience helps: you’ll configure service accounts, run a Next.js application, and edit the source code. You can use a coding assistant to build your features. The repository includes setup guides and project instructions to support that workflow.",
    },
    {
      question: "What do I need to get started?",
      answer:
        "A supported Node.js installation and your own hosted service accounts. The setup guide covers Supabase, email, Stripe, and optional integrations. Account verification, sending-domain setup, and live payment activation can require manual steps.",
    },
    {
      question: "Where does my application run?",
      answer:
        "Next.js runs on your computer during development and is designed for deployment to Vercel. Supabase stays hosted throughout. Your provider accounts and credentials stay under your control; there is no seller-operated setup service.",
    },
    {
      question: "Can I change the design and features?",
      answer:
        "Yes. The source uses Next.js, TypeScript, Tailwind, and shadcn/ui. Change the branding and interface, extend the product, or follow the documentation to remove the optional AI example. You maintain your customized copy.",
    },
    {
      question: "Are hosting and service costs included?",
      answer:
        "No. Hosting, database, email, payment processing, and any AI usage are billed by your providers. The starter purchase offer, license, and support terms are still being finalized and will be published before purchasing opens.",
    },
  ],
}

export const billingFaqs = [
  {
    question: "Is a subscription shared across workspaces?",
    answer:
      "Each workspace has its own subscription. Everyone in that workspace shares access, with no per-seat charges. If you create another workspace, its subscription is managed separately.",
  },
  {
    question: "Can I pay monthly or yearly?",
    answer:
      "Yes. Choose Monthly or Yearly to see the full charge for that billing period. Any annual savings are calculated from the current monthly and yearly prices.",
  },
  {
    question: "Can I change or cancel my plan?",
    answer:
      "Workspace owners and admins can manage their plan in Settings → Billing. Plan changes are confirmed in the Stripe customer portal. Cancellation takes effect at the end of your paid period, so you keep access until then.",
  },
  {
    question: "Do subscriptions include recurring AI credits?",
    answer:
      "No. The optional AI example gives each workspace 100 credits once. These are separate from billing and do not renew when a subscription is purchased or renewed.",
  },
  {
    question: "Does this pricing purchase the starter source code?",
    answer:
      "These plans are workspace subscriptions in the application. The starter source-code purchase offer and license are separate and will be published before sales open.",
  },
]
