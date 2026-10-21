import { supabase } from '@/lib/supabase';
import type { Course, CourseAudienceGender, CourseModule, CourseStatus } from '@/types/education';

const COURSE_FIELDS = 'id,slug,title,description,category,thumbnail_url,is_free,audience_gender,price_amount,currency,status,display_order,created_at,updated_at';

export type AdminCourseMetadata = Pick<
  Course,
  'title' | 'description' | 'category' | 'thumbnail_url' | 'audience_gender' | 'display_order'
>;

export interface CreateAdminCourseInput extends AdminCourseMetadata {
  slug: string;
}

export interface AdminCoursePublicationReadiness {
  course_id: string;
  can_publish: boolean;
  module_count: number;
  published_lesson_count: number;
  draft_lesson_count: number;
  reasons: string[];
}

const allowedStatusTransitions: Record<CourseStatus, CourseStatus[]> = {
  draft: ['published', 'archived'],
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

  const { data, error } = await supabase.rpc('admin_set_course_status', {
    p_course_id: course.id,
    p_status: nextStatus,
  });

  if (error) throw error;
  if (!(data as Array<{ course_id: string }> | null)?.[0]) {
    throw new Error('The course status was not updated. Refresh and try again.');
  }
}

export async function getAdminCoursePublicationReadiness(
  courseId: string,
): Promise<AdminCoursePublicationReadiness> {
  const { data, error } = await supabase.rpc('get_admin_course_publication_readiness', {
    p_course_id: courseId,
  });

  if (error) throw error;
  const readiness = (data as AdminCoursePublicationReadiness[] | null)?.[0];
  if (!readiness) throw new Error('Publication readiness was not returned. Refresh and try again.');
  return readiness;
}

export async function getAdminCourseModules(courseId: string): Promise<CourseModule[]> {
  const { data, error } = await supabase
    .from('course_modules')
    .select('*')
    .eq('course_id', courseId)
    .order('display_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return (data ?? []) as CourseModule[];
}

export async function getAdminCourseModuleCounts(courseIds: string[]): Promise<Record<string, number>> {
  if (courseIds.length === 0) return {};
  const { data, error } = await supabase
    .from('course_modules')
    .select('course_id')
    .in('course_id', courseIds);

  if (error) throw error;
  return (data ?? []).reduce<Record<string, number>>((counts, row) => {
    counts[row.course_id] = (counts[row.course_id] ?? 0) + 1;
    return counts;
  }, {});
}

function firstModuleResult(data: unknown): CourseModule {
  const row = (data as CourseModule[] | null)?.[0];
  if (!row) throw new Error('The module request returned no module. Refresh and try again.');
  return row;
}

export async function createAdminCourseModule(
  courseId: string,
  title: string,
  description: string,
): Promise<CourseModule> {
  const { data, error } = await supabase.rpc('admin_create_course_module', {
    p_course_id: courseId,
    p_title: title,
    p_description: description.trim() || null,
  });
  if (error) throw error;
  return firstModuleResult(data);
}

export async function updateAdminCourseModule(
  moduleId: string,
  title: string,
  description: string,
): Promise<CourseModule> {
  const { data, error } = await supabase.rpc('admin_update_course_module', {
    p_module_id: moduleId,
    p_title: title,
    p_description: description.trim() || null,
  });
  if (error) throw error;
  return firstModuleResult(data);
}

export async function reorderAdminCourseModules(courseId: string, moduleIds: string[]): Promise<void> {
  const { data, error } = await supabase.rpc('admin_reorder_course_modules', {
    p_course_id: courseId,
    p_module_ids: moduleIds,
  });
  if (error) throw error;
  if (!(data as Array<{ course_id: string }> | null)?.[0]) {
    throw new Error('The module order was not saved. Refresh and try again.');
  }
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
