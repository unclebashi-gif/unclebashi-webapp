import { supabase } from '@/lib/supabase';
import type { Course, CourseAudienceGender, CourseStatus } from '@/types/education';

const COURSE_FIELDS = 'id,slug,title,description,category,thumbnail_url,is_free,audience_gender,price_amount,currency,status,display_order,created_at,updated_at';

export type AdminCourseMetadata = Pick<
  Course,
  'title' | 'description' | 'category' | 'thumbnail_url' | 'audience_gender' | 'display_order'
>;

export interface CreateAdminCourseInput extends AdminCourseMetadata {
  slug: string;
}

const allowedStatusTransitions: Record<CourseStatus, CourseStatus[]> = {
  draft: ['archived'],
  published: ['draft'],
  archived: ['draft'],
};

export async function getAdminCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select(COURSE_FIELDS)
    .order('display_order', { ascending: true })
    .order('title', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Course[];
}

export async function createAdminCourse(input: CreateAdminCourseInput): Promise<Course> {
  const { data, error } = await supabase
    .from('courses')
    .insert({
      ...input,
      status: 'draft',
    })
    .select(COURSE_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('That slug is already in use. Choose a unique slug.');
    throw error;
  }
  return data as Course;
}

export async function updateAdminCourseMetadata(courseId: string, input: AdminCourseMetadata): Promise<Course> {
  const { data, error } = await supabase
    .from('courses')
    .update(input)
    .eq('id', courseId)
    .select(COURSE_FIELDS)
    .single();

  if (error) throw error;
  return data as Course;
}

export async function updateAdminCourseStatus(course: Course, nextStatus: CourseStatus): Promise<void> {
  const isSandboxCourse = course.slug.startsWith('sandbox-');
  const safeNextStatus = isSandboxCourse
    ? nextStatus === 'draft' && course.status !== 'draft'
    : allowedStatusTransitions[course.status].includes(nextStatus);

  if (!safeNextStatus) throw new Error('That course status change is not available.');

  const { data, error } = await supabase
    .from('courses')
    .update({ status: nextStatus })
    .eq('id', course.id)
    .select('id')
    .single();

  if (error) throw error;
  if (!data) throw new Error('The course status was not updated. Refresh and try again.');
}

export function normalizeCourseMetadata(input: {
  title: string;
  description: string;
  category: string;
  thumbnailUrl: string;
  audienceGender: CourseAudienceGender;
  displayOrder: string;
}): AdminCourseMetadata {
  const displayOrder = Number(input.displayOrder.trim());
  if (!Number.isSafeInteger(displayOrder) || displayOrder < 0) {
    throw new Error('Display order must be a whole number of zero or greater.');
  }

  return {
    title: input.title.trim(),
    description: input.description.trim() || null,
    category: input.category.trim() || null,
    thumbnail_url: input.thumbnailUrl.trim() || null,
    audience_gender: input.audienceGender,
    display_order: displayOrder,
  };
}
