-- Seed the approved free-course metadata as draft content. Media remains unset
-- until production assets are approved and must not be replaced with demo URLs.
begin;

insert into public.courses (
  id, slug, title, description, category, is_free, status, display_order
) values (
  '7df786b2-609a-4c4c-9e57-6f0ee4ec3a10',
  'free-overview',
  'Marriage Preparation Overview',
  'A FREE 10-minute introduction to intentional marriage preparation. Get a taste of what Uncle Bashi offers and start your journey today!',
  'overview',
  true,
  'draft',
  0
)
on conflict do nothing;

insert into public.course_modules (
  id, course_id, title, display_order
) values (
  'e9d2dc86-8147-4e83-8443-845fb86dbb31',
  '7df786b2-609a-4c4c-9e57-6f0ee4ec3a10',
  'Foundations of Marriage Preparation',
  0
)
on conflict do nothing;

insert into public.lessons (
  id, module_id, course_id, title, description, content_type, media_url,
  content_body, duration_minutes, reflection_prompts, status, display_order
) values
  (
    '3fcab8ad-2b5a-4f55-9567-3b623f62c4e1',
    'e9d2dc86-8147-4e83-8443-845fb86dbb31',
    '7df786b2-609a-4c4c-9e57-6f0ee4ec3a10',
    'Welcome to Uncle Bashi',
    'Introduction to intentional marriage preparation and what makes our approach unique',
    'video', null, null, 3,
    array[
      'What brought you to Uncle Bashi?',
      'What does intentional marriage mean to you?'
    ],
    'draft', 1
  ),
  (
    '57c5b0f4-85d2-4c42-9e2c-1a9c5df060f2',
    'e9d2dc86-8147-4e83-8443-845fb86dbb31',
    '7df786b2-609a-4c4c-9e57-6f0ee4ec3a10',
    'The Journey Ahead',
    'Overview of the preparation process and how Uncle Bashi guides you',
    'video', null, null, 4,
    array[
      'What do you hope to learn?',
      'What areas of marriage preparation interest you most?'
    ],
    'draft', 2
  ),
  (
    '50f7214d-8950-4c95-89db-a0f9c3fba023',
    'e9d2dc86-8147-4e83-8443-845fb86dbb31',
    '7df786b2-609a-4c4c-9e57-6f0ee4ec3a10',
    'Your First Step',
    'How to make the most of this platform and begin your journey',
    'video', null, null, 3,
    array[
      'What is one thing you want to work on?',
      'How committed are you to this journey?'
    ],
    'draft', 3
  )
on conflict do nothing;

-- Conflicts are ignored only during insertion, then every deterministic row is
-- verified. An incompatible pre-existing row aborts the whole migration.
do $verify_seed$
begin
  if not exists (
    select 1 from public.courses
    where id = '7df786b2-609a-4c4c-9e57-6f0ee4ec3a10'
      and slug = 'free-overview'
      and title = 'Marriage Preparation Overview'
      and description = 'A FREE 10-minute introduction to intentional marriage preparation. Get a taste of what Uncle Bashi offers and start your journey today!'
      and category = 'overview'
      and thumbnail_url is null
      and is_free is true
      and status = 'draft'
      and display_order = 0
  ) then
    raise exception 'free-overview course conflicts with the approved seed';
  end if;

  if not exists (
    select 1 from public.course_modules
    where id = 'e9d2dc86-8147-4e83-8443-845fb86dbb31'
      and course_id = '7df786b2-609a-4c4c-9e57-6f0ee4ec3a10'
      and title = 'Foundations of Marriage Preparation'
      and description is null
      and display_order = 0
  ) then
    raise exception 'free-overview module conflicts with the approved seed';
  end if;

  if not exists (
    select 1 from public.lessons
    where id = '3fcab8ad-2b5a-4f55-9567-3b623f62c4e1'
      and module_id = 'e9d2dc86-8147-4e83-8443-845fb86dbb31'
      and course_id = '7df786b2-609a-4c4c-9e57-6f0ee4ec3a10'
      and title = 'Welcome to Uncle Bashi'
      and description = 'Introduction to intentional marriage preparation and what makes our approach unique'
      and content_type = 'video' and media_url is null and content_body is null
      and duration_minutes = 3
      and reflection_prompts = array[
        'What brought you to Uncle Bashi?',
        'What does intentional marriage mean to you?'
      ]::text[]
      and status = 'draft' and display_order = 1
  ) or not exists (
    select 1 from public.lessons
    where id = '57c5b0f4-85d2-4c42-9e2c-1a9c5df060f2'
      and module_id = 'e9d2dc86-8147-4e83-8443-845fb86dbb31'
      and course_id = '7df786b2-609a-4c4c-9e57-6f0ee4ec3a10'
      and title = 'The Journey Ahead'
      and description = 'Overview of the preparation process and how Uncle Bashi guides you'
      and content_type = 'video' and media_url is null and content_body is null
      and duration_minutes = 4
      and reflection_prompts = array[
        'What do you hope to learn?',
        'What areas of marriage preparation interest you most?'
      ]::text[]
      and status = 'draft' and display_order = 2
  ) or not exists (
    select 1 from public.lessons
    where id = '50f7214d-8950-4c95-89db-a0f9c3fba023'
      and module_id = 'e9d2dc86-8147-4e83-8443-845fb86dbb31'
      and course_id = '7df786b2-609a-4c4c-9e57-6f0ee4ec3a10'
      and title = 'Your First Step'
      and description = 'How to make the most of this platform and begin your journey'
      and content_type = 'video' and media_url is null and content_body is null
      and duration_minutes = 3
      and reflection_prompts = array[
        'What is one thing you want to work on?',
        'How committed are you to this journey?'
      ]::text[]
      and status = 'draft' and display_order = 3
  ) then
    raise exception 'free-overview lessons conflict with the approved seed';
  end if;
end;
$verify_seed$;

commit;
