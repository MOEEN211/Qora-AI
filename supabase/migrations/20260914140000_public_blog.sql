-- Global editorial content, never tenant-owned. Only the database operator writes.
create table public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) <= 160 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (length(title) between 1 and 180),
  excerpt text not null check (length(excerpt) between 1 and 500),
  category text not null check (length(category) between 1 and 60),
  author text not null check (length(author) between 1 and 100),
  thumbnail_path text not null default '/blog/forma-journal.png' check (thumbnail_path ~ '^/blog/[a-z0-9-]+\.(webp|png|jpg)$'),
  content jsonb not null check (jsonb_typeof(content) = 'array' and jsonb_array_length(content) between 1 and 40),
  reading_minutes integer not null check (reading_minutes between 1 and 120),
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);
alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from public, anon, authenticated;
grant select on public.blog_posts to anon, authenticated;
create policy blog_published_read on public.blog_posts for select to anon, authenticated
  using (status = 'published' and published_at <= now());
create index blog_published_order_idx on public.blog_posts(published_at desc, slug) where status='published';

-- Seed once through the checksum ledger. Conflict handling preserves buyer content.
insert into public.blog_posts(slug,title,excerpt,category,author,thumbnail_path,reading_minutes,status,published_at,content) values
('start-small-build-something-real','Start small. Build something real.','A useful first version starts with one clear promise. Here is how to turn a big idea into a small product worth using.','Building','Forma team','/blog/forma-journal.png',3,'published','2026-09-12T12:00:00Z',
$post$[
 {"heading":"Find the moment that matters","paragraphs":["A product idea often arrives as a long list of features. A calendar, a dashboard, an assistant, a place for the team. Before building any of them, choose one moment you want to make easier for one kind of person.","Imagine a small design studio collecting feedback from a client. The useful moment is not opening another dashboard. It is knowing which changes are approved, which questions remain, and what to do next. That is a specific promise you can build around."]},
 {"heading":"Make the first loop complete","paragraphs":["Draw the shortest path from a person arriving to getting that result. For the studio, it could be creating a project, sharing a draft, receiving a comment, and marking the next action. Each step earns its place because the next step depends on it.","A complete loop can be modest. One project type, one invitation flow, and one clear result may be enough to start learning. A broad collection of unfinished screens makes it harder to see whether the underlying idea helps anyone."]},
 {"heading":"Give the foundation a clear job","paragraphs":["Accounts, workspaces, and billing support the product promise. They should make the useful work possible without dominating it. Start with the foundation provided by the template, then spend your attention on the decisions that are specific to your customers.","Keep the first experience understandable. Name buttons after the action they perform. Explain an empty page with the next useful step. Make it obvious where work was saved and who can see it. These details often matter more than adding another feature."]},
 {"heading":"Watch someone use it","paragraphs":["Put the smallest complete version in front of a person who recognizes the problem. Ask them to do the task in their own words. Watch where they pause, what they expect to happen, and whether they reach the result without help.","Write down the surprises before suggesting solutions. Then choose one improvement, make it, and repeat the exercise. A useful product grows through this steady cycle of real work, observation, and careful adjustment."]}
]$post$::jsonb),
('make-your-workspace-feel-like-home','Make your workspace feel like home.','Thoughtful names, clear roles, and a few considered details can turn a new workspace into a place your team understands.','Product design','Forma team','/blog/forma-journal.png',3,'published','2026-09-10T12:00:00Z',
$post$[
 {"heading":"Start with familiar language","paragraphs":["A new workspace should help people recognize where they are. Give it a name your team already uses. Add a simple logo that stays legible at a small size. Use the same names for projects and activities that appear in everyday conversations.","Familiar language removes a small decision from every visit. Instead of asking people to learn your internal terminology, let the interface reflect the work they came to do."]},
 {"heading":"Make access understandable","paragraphs":["Before inviting a teammate, decide what they need to do. Some people manage the workspace. Others contribute to shared work. The interface should make those responsibilities visible without asking everyone to become an expert in permissions.","Explain the difference between a personal account and a shared workspace. A person can belong to more than one team, and changing teams should make the current context obvious. A clear workspace name beside the navigation helps prevent accidental work in the wrong place."]},
 {"heading":"Design the empty moments","paragraphs":["An empty project list is part of the product. Use it to explain what belongs there and provide one useful first action. Avoid filling a real customer workspace with unexplained demonstration data that could be mistaken for saved work.","After an action succeeds, show its result where the person expects to find it. An invitation should appear in the team list. A changed name should appear in the workspace control. Small, consistent confirmations build confidence."]},
 {"heading":"Keep the details consistent","paragraphs":["A shared visual system makes an application feel coherent. Reuse spacing, button treatments, field labels, and status language. The installed components give you a starting point; the important work is applying them consistently to your own flows.","Try the workspace on a small screen and with the keyboard. Long names, crowded menus, and unclear focus states are easier to fix early. A welcoming workspace works for the people using it, wherever they happen to be."]}
]$post$::jsonb),
('a-calmer-path-to-your-first-launch','A calmer path to your first launch.','A practical way to prepare the important journeys, collect useful feedback, and keep improving after launch day.','Field notes','Forma team','/blog/forma-journal.png',3,'published','2026-09-08T12:00:00Z',
$post$[
 {"heading":"Define what ready means","paragraphs":["Launch preparation becomes easier when ready describes observable behavior. A new customer can create an account, understand the product, complete its main task, and get help when something goes wrong. Write those journeys down before polishing the announcement.","Choose a small initial audience and a clear invitation. Explain who the product is for, what it helps them do, and what you would like to learn. A focused introduction creates more useful conversations than a promise to solve everything."]},
 {"heading":"Rehearse the ordinary journeys","paragraphs":["Walk through signup, sign-in, password recovery, and the main product task using a fresh account. If your product charges for access, verify checkout, cancellation, and the experience when a payment does not succeed in the provider’s test environment.","Check the pages people visit when they are deciding whether to trust you: pricing, contact, privacy, and terms. Replace sample copy with information that reflects your own business and have legal documents reviewed for your actual practices."]},
 {"heading":"Make feedback easy to use","paragraphs":["Give people a visible way to report a problem and describe what they were trying to achieve. Separate an observed issue from a proposed solution. Several different feature requests may point to the same confusing step.","Keep a short list of findings with the affected journey, the evidence, and the next action. Fix problems that block the product’s promise before adding features that make the announcement sound larger."]},
 {"heading":"Plan the morning after","paragraphs":["Set aside time after launch to answer questions and watch the important journeys. Know where to inspect errors and how to contact a customer who needs help. Leave enough room in the schedule to make small corrections without rushing.","A launch is the beginning of a working relationship. Keep the promises you made, explain changes clearly, and continue learning from the people who choose to use what you built."]}
]$post$::jsonb)
on conflict (slug) do nothing;
