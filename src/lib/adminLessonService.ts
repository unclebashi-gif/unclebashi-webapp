import { supabase } from '@/lib/supabase';
import type { Lesson, LessonContentType, LessonStatus } from '@/types/education';

export interface AdminLessonPublicationReadiness {
  lesson_id: string;
  can_publish: boolean;
  reasons: string[];
}

export interface AdminCourseLessonInput {
  title: string;
  description: string;
  contentType: LessonContentType;
  durationMinutes: number;
  mediaUrl: string;
  contentBody: string;
  reflectionPrompts: string[];
}

function firstLessonResult(data: unknown): Lesson {
  const lesson = (data as Lesson[] | null)?.[0];
  if (!lesson) throw new Error('The lesson request returned no lesson. Refresh and try again.');
  return lesson;
}

export async function getAdminModuleLessons(moduleId: string): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('module_id', moduleId)
    .order('display_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Lesson[];
}

export async function getAdminModuleLessonCounts(moduleIds: string[]): Promise<Record<string, number>> {
  if (moduleIds.length === 0) return {};
  const { data, error } = await supabase
    .from('lessons')
    .select('module_id')
    .in('module_id', moduleIds);
  if (error) throw error;
  return (data ?? []).reduce<Record<string, number>>((counts, row) => {
    counts[row.module_id] = (counts[row.module_id] ?? 0) + 1;
    return counts;
  }, {});
}

export async function getAdminLessonPublicationReadiness(
  lessonId: string,
): Promise<AdminLessonPublicationReadiness> {
  const { data, error } = await supabase.rpc('get_admin_lesson_publication_readiness', {
    p_lesson_id: lessonId,
  });
  if (error) throw error;
  const result = (data as AdminLessonPublicationReadiness[] | null)?.[0];
  if (!result) throw new Error('Lesson readiness was not returned. Refresh and try again.');
  return result;
}

export async function createAdminCourseLesson(
  moduleId: string,
  input: AdminCourseLessonInput,
): Promise<Lesson> {
  const { data, error } = await supabase.rpc('admin_create_course_lesson', {
    p_module_id: moduleId,
    p_title: input.title.trim(),
    p_content_type: input.contentType,
    p_duration_minutes: input.durationMinutes,
    p_description: input.description.trim() || null,
    p_media_url: input.mediaUrl.trim() || null,
    p_content_body: input.contentBody.trim() || null,
    p_reflection_prompts: input.reflectionPrompts,
  });
  if (error) throw error;
  return firstLessonResult(data);
}

export async function updateAdminCourseLesson(
  lessonId: string,
  input: AdminCourseLessonInput,
): Promise<Lesson> {
  const { data, error } = await supabase.rpc('admin_update_course_lesson', {
    p_lesson_id: lessonId,
    p_title: input.title.trim(),
    p_content_type: input.contentType,
    p_duration_minutes: input.durationMinutes,
    p_description: input.description.trim() || null,
    p_media_url: input.mediaUrl.trim() || null,
    p_content_body: input.contentBody.trim() || null,
    p_reflection_prompts: input.reflectionPrompts,
  });
  if (error) throw error;
  return firstLessonResult(data);
}

export async function setAdminCourseLessonStatus(lessonId: string, status: LessonStatus): Promise<void> {
  const { data, error } = await supabase.rpc('admin_set_course_lesson_status', {
    p_lesson_id: lessonId,
    p_status: status,
  });
  if (error) throw error;
  if (!(data as Array<{ lesson_id: string }> | null)?.[0]) {
    throw new Error('The lesson status was not updated. Refresh and try again.');
  }
}

export async function reorderAdminModuleLessons(moduleId: string, lessonIds: string[]): Promise<void> {
  const { data, error } = await supabase.rpc('admin_reorder_module_lessons', {
    p_module_id: moduleId,
    p_lesson_ids: lessonIds,
  });
  if (error) throw error;
  if (!(data as Array<{ module_id: string }> | null)?.[0]) {
    throw new Error('The lesson order was not saved. Refresh and try again.');
  }
}
