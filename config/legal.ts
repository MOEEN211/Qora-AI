import { site } from "./site"
// Deliberate placeholders. Replace with reviewed policies before launch.
export const legal = {
  privacy: {
    title: "Privacy policy",
    description: `How information is handled when you use ${site.name}.`,
    sections: [
      {
        heading: "Who we are",
        paragraphs: [
          `This sample policy describes how [Legal business name], the operator of ${site.name}, handles personal information. Replace these placeholders with your registered name, [Postal address], and [Privacy email]. Effective date: [Date].`,
          "This is a starting point for customization, not a statement of a deployed business’s actual practices.",
        ],
      },
      {
        heading: "Information we collect",
        paragraphs: [
          "Account information may include your name, email address, profile image, and authentication details. Workspace information may include memberships, invitations, settings, and content you create or upload.",
          "Subscription records may include your plan, billing contact, payment status, and payment-provider identifiers. Payment card details are handled by the payment provider. Describe any device information, logs, support messages, feedback, and usage events your deployment actually collects.",
        ],
      },
      {
        heading: "How information is used",
        paragraphs: [
          "Information is used to provide accounts and workspaces, process subscriptions, respond to support, maintain security, and send service communications. Describe additional uses only if you actually perform them.",
          "Where required, identify the lawful basis for each purpose: for example, performing a contract, meeting legal obligations, legitimate interests with those interests explained, or consent that can be withdrawn.",
        ],
      },
      {
        heading: "Service providers and sharing",
        paragraphs: [
          "List the providers your deployment actually uses, what each receives, and why. The starter can use Supabase for accounts and databases, Stripe for payments, Resend for email, and Vercel for hosting. Optional integrations require additional disclosures when enabled.",
          "Explain how workspace administrators and teammates access shared information. Identify public content and describe any disclosures required by law or associated with a business transfer.",
        ],
      },
      {
        heading: "AI and optional integrations",
        paragraphs: [
          "If AI is enabled, explain which prompts and conversation context reach each provider, how responses are stored, and the provider’s retention and training practices. Only submit information you are authorized to share.",
          "If analytics or advertising are enabled, describe the actual data collected and available choices. This sample does not obtain consent to optional tracking.",
        ],
      },
      {
        heading: "Cookies and browser storage",
        paragraphs: [
          "The application uses authentication cookies and may retain workspace and display preferences. Add an inventory describing the purposes and lifetimes of cookies and browser storage in your deployment.",
          "Where required, obtain consent before setting optional cookies and explain how people can change their choices.",
        ],
      },
      {
        heading: "Retention, security, and transfers",
        paragraphs: [
          "Specify retention periods or concrete criteria for account content, logs, billing records, and backups. Explain what happens after account or workspace deletion and which records must be retained.",
          "Describe actual security practices without promising absolute security. Identify processing locations and applicable international-transfer safeguards, including how to obtain further information.",
        ],
      },
      {
        heading: "Your choices and rights",
        paragraphs: [
          "You can manage available profile and workspace settings in the application. Depending on applicable law, you may have rights to access, correct, delete, export, restrict, or object to processing, and withdraw consent where processing relies on it.",
          "Send requests to [Privacy email]. State verification procedures, response timelines, and the relevant supervisory authority or complaint route. Add applicable regional rights and how to exercise them.",
        ],
      },
      {
        heading: "Children, changes, and contact",
        paragraphs: [
          "Specify your intended audience, applicable minimum age, and process for handling information collected from children. Choose these terms for your product and markets.",
          "Explain how you communicate material policy changes. Contact: [Legal business name], [Postal address], [Privacy email].",
        ],
      },
    ],
  },
  terms: {
    title: "Terms and conditions",
    description: `A sample agreement for using ${site.name}.`,
    sections: [
      {
        heading: "About these terms",
        paragraphs: [
          `These sample terms describe an agreement between [Legal business name] and the person or organization using ${site.name}. Effective date: [Date]. Replace placeholders and confirm this agreement fits your service and markets before publishing.`,
          "These terms cover application use. A separate license is needed to sell or distribute the starter’s source code; this sample does not grant resale or redistribution rights.",
        ],
      },
      {
        heading: "Accounts and workspaces",
        paragraphs: [
          "Provide accurate information, protect your credentials, and notify [Support email] of suspected unauthorized access. You must have authority to act for an organization you represent.",
          "Workspace owners and administrators manage shared-resource access. Only invite people and upload information you are authorized to share. Specify eligibility and minimum-age requirements here.",
        ],
      },
      {
        heading: "Acceptable use",
        paragraphs: [
          "Use the service lawfully and respect others’ rights. Do not attempt unauthorized access, interfere with availability, distribute malicious code, or infringe privacy or intellectual property rights.",
          "Do not circumvent access controls or abuse automated features. Add product-specific restrictions and a route for reporting misuse.",
        ],
      },
      {
        heading: "Subscriptions and payment",
        paragraphs: [
          "Display prices, billing intervals, and included features before purchase. Each workspace may have a separately billed subscription. Explain actual renewal, taxes, plan-change, and trial conditions.",
          "State when cancellation takes effect and provide a working cancellation route. Insert [Cancellation, refund, and consumer withdrawal rights policy]. Explain separate account-deletion and subscription-cancellation steps before purchase.",
        ],
      },
      {
        heading: "Your content",
        paragraphs: [
          "You retain rights in submitted content. You authorize the operator and its providers to process it as needed to provide and maintain the service, subject to the final agreement and privacy policy.",
          "You are responsible for necessary permissions. Describe export tools, removal procedures, and what happens to shared content when a member leaves.",
        ],
      },
      {
        heading: "AI and third-party services",
        paragraphs: [
          "Optional AI can produce inaccurate or incomplete responses. Review outputs before relying on them. They do not replace appropriate professional judgment. Define additional restrictions that match your product.",
          "Third-party services may have separate terms and availability limits. Identify services customers interact with directly and agreements they must accept.",
        ],
      },
      {
        heading: "Availability and ownership",
        paragraphs: [
          "The operator retains rights in the application and branding, except for rights expressly granted and third-party materials governed by their own licenses. These terms do not transfer software ownership.",
          "Describe actual support, maintenance, and service commitments. Do not imply a service-level guarantee unless you have adopted one.",
        ],
      },
      {
        heading: "Suspension and termination",
        paragraphs: [
          "Explain when access may be suspended or terminated, notice and review procedures, and how customers retrieve eligible content. Include a contact route for resolving mistakes.",
          "Customers can stop using the service and use available cancellation and deletion controls. State obligations surviving termination and lawful retention requirements.",
        ],
      },
      {
        heading: "Liability and mandatory rights",
        paragraphs: [
          "Insert warranties and liability limits only after review for your business, product risks, and applicable law. [Reviewed warranty and liability provisions].",
          "The final agreement should preserve rights and liabilities that cannot lawfully be excluded, including mandatory consumer protections.",
        ],
      },
      {
        heading: "Changes, disputes, and contact",
        paragraphs: [
          "State how material changes are communicated and when they take effect. Specify [Governing law] and [Dispute resolution process] while protecting mandatory local rights. This sample selects no jurisdiction or arbitration requirement.",
          "Contact: [Legal business name], [Postal address], [Support email].",
        ],
      },
    ],
  },
}
