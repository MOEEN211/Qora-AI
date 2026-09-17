export async function verifyBlog(api) {
  const [result] = await api.query(`/* blog-verification */ select
    (select c.relrowsecurity from pg_class c where c.oid=to_regclass('public.blog_posts')) as rls,
    has_table_privilege('anon','public.blog_posts','SELECT') and has_table_privilege('authenticated','public.blog_posts','SELECT') as readable,
    not has_table_privilege('anon','public.blog_posts','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      and not has_table_privilege('authenticated','public.blog_posts','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as readonly,
    (select count(*)::int from pg_policy where polrelid='public.blog_posts'::regclass and polname='blog_published_read' and polcmd='r') as policies,
    exists(select 1 from pg_index where indexrelid=to_regclass('public.blog_published_order_idx') and indisvalid) as indexed`);
  if (!result?.rls || !result.readable || !result.readonly || result.policies !== 1 || !result.indexed)
    throw new Error("Blog storage or public read-only permissions are incomplete. Check the blog migration.");
}
