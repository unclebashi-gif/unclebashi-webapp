import { supabase } from '@/lib/supabase';
import type {
  Course,
  CourseEnrollment,
  CourseModule,
  ContinueWatchingEntry,
  EnrollInFreeCourseResult,
  Lesson,
  LessonProgressSaveInput,
  SaveLessonProgressResult,
  SaveLessonReflectionResult,
  UserCourseProgress,
  UserLessonProgress,
  UserReflection,
} from '@/types/education';

async function requireAuthenticatedUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const userId = data.session?.user.id;
  if (!userId) throw new Error('Sign in to access your Education data.');
  return userId;
}

function throwQueryError(error: unknown): never {
  throw error;
}

export async function getPublishedCourses(): Promise<Course[]> {
  await requireAuthenticatedUserId();
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('status', 'published')
    .order('display_order', { ascending: true });

  if (error) throwQueryError(error);
  return (data ?? []) as Course[];
}

export async function getPublishedCourseModules(courseId: string): Promise<CourseModule[]> {
  await requireAuthenticatedUserId();
  const { data, error } = await supabase
    .from('course_modules')
    .select('*')
    .eq('course_id', courseId)
    .order('display_order', { ascending: true });

  if (error) throwQueryError(error);
  return (data ?? []) as CourseModule[];
}

export async function getAccessibleLessons(courseId: string): Promise<Lesson[]> {
  await requireAuthenticatedUserId();
  const { data, error } = await supabase
    .from('lessons')
    .select('*')
    .eq('course_id', courseId)
    .eq('status', 'published')
    .order('display_order', { ascending: true });

  if (error) throwQueryError(error);
  return (data ?? []) as Lesson[];
}

export async function getMyEnrollments(): Promise<CourseEnrollment[]> {
  const userId = await requireAuthenticatedUserId();
  const { data, error } = await supabase
    .from('course_enrollments')
    .select('*')
    .eq('user_id', userId)
    .order('enrolled_at', { ascending: false });

  if (error) throwQueryError(error);
  return (data ?? []) as CourseEnrollment[];
}

export async function getMyLessonProgress(): Promise<UserLessonProgress[]> {
  const enrollments = await getMyEnrollments();
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
  if (enrollmentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('user_lesson_progress')
    .select('*')
    .in('enrollment_id', enrollmentIds)
    .order('updated_at', { ascending: false });

  if (error) throwQueryError(error);
  return (data ?? []) as UserLessonProgress[];
}

export async function getMyCourseProgress(): Promise<UserCourseProgress[]> {
  const enrollments = await getMyEnrollments();
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
  if (enrollmentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('user_course_progress')
    .select('*')
    .in('enrollment_id', enrollmentIds)
    .order('updated_at', { ascending: false });

  if (error) throwQueryError(error);
  return (data ?? []) as UserCourseProgress[];
}

export async function getMyReflections(): Promise<UserReflection[]> {
  const enrollments = await getMyEnrollments();
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
  if (enrollmentIds.length === 0) return [];

  const { data, error } = await supabase
    .from('user_reflections')
    .select('*')
    .in('enrollment_id', enrollmentIds)
    .order('updated_at', { ascending: false });

  if (error) throwQueryError(error);
  return (data ?? []) as UserReflection[];
}

export interface MyEducationState {
  enrollments: CourseEnrollment[];
  lessonProgress: UserLessonProgress[];
  courseProgress: UserCourseProgress[];
  reflections: UserReflection[];
}

export async function getMyEducationState(): Promise<MyEducationState> {
  const enrollments = await getMyEnrollments();
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
  if (enrollmentIds.length === 0) {
    return { enrollments, lessonProgress: [], courseProgress: [], reflections: [] };
  }

  const [lessonResult, courseResult, reflectionResult] = await Promise.all([
    supabase.from('user_lesson_progress').select('*').in('enrollment_id', enrollmentIds)
      .order('updated_at', { ascending: false }),
    supabase.from('user_course_progress').select('*').in('enrollment_id', enrollmentIds)
      .order('updated_at', { ascending: false }),
    supabase.from('user_reflections').select('*').in('enrollment_id', enrollmentIds)
      .order('updated_at', { ascending: false }),
  ]);

  if (lessonResult.error) throwQueryError(lessonResult.error);
  if (courseResult.error) throwQueryError(courseResult.error);
  if (reflectionResult.error) throwQueryError(reflectionResult.error);

  return {
    enrollments,
    lessonProgress: (lessonResult.data ?? []) as UserLessonProgress[],
    courseProgress: (courseResult.data ?? []) as UserCourseProgress[],
    reflections: (reflectionResult.data ?? []) as UserReflection[],
  };
}

export async function getMyContinueWatchingEntries(): Promise<ContinueWatchingEntry[]> {
  const enrollments = (await getMyEnrollments()).filter((row) => row.status === 'active');
  if (enrollments.length === 0) return [];

  const enrollmentIds = enrollments.map((row) => row.id);
  const courseIds = [...new Set(enrollments.map((row) => row.course_id))];
  const [progressResult, summaryResult] = await Promise.all([
    supabase.from('user_lesson_progress').select('*').in('enrollment_id', enrollmentIds)
      .order('updated_at', { ascending: false }),
    supabase.from('user_course_progress').select('*').in('enrollment_id', enrollmentIds),
  ]);
  if (progressResult.error) throwQueryError(progressResult.error);
  if (summaryResult.error) throwQueryError(summaryResult.error);

  const progressRows = (progressResult.data ?? []) as UserLessonProgress[];
  const candidates = progressRows.filter((row) =>
    !row.is_completed && (row.last_position_seconds > 0 || row.accumulated_watch_seconds > 0),
  );
  if (candidates.length === 0) return [];

  const lessonIds = [...new Set(candidates.map((row) => row.lesson_id))];
  const [courseResult, lessonResult] = await Promise.all([
    supabase.from('courses').select('*').in('id', courseIds),
    supabase.from('lessons').select('*').in('id', lessonIds).eq('status', 'published'),
  ]);
  if (courseResult.error) throwQueryError(courseResult.error);
  if (lessonResult.error) throwQueryError(lessonResult.error);

  const lessons = (lessonResult.data ?? []) as Lesson[];
  const moduleIds = [...new Set(lessons.map((row) => row.module_id))];
  if (moduleIds.length === 0) return [];

  const moduleResult = await supabase.from('course_modules').select('*').in('id', moduleIds);
  if (moduleResult.error) throwQueryError(moduleResult.error);

  const enrollmentById = new Map(enrollments.map((row) => [row.id, row]));
  const courseById = new Map(((courseResult.data ?? []) as Course[]).map((row) => [row.id, row]));
  const lessonById = new Map(lessons.map((row) => [row.id, row]));
  const moduleById = new Map(((moduleResult.data ?? []) as CourseModule[]).map((row) => [row.id, row]));
  const summaryByEnrollment = new Map(
    ((summaryResult.data ?? []) as UserCourseProgress[]).map((row) => [row.enrollment_id, row]),
  );

  return candidates.flatMap((lessonProgress) => {
    const enrollment = enrollmentById.get(lessonProgress.enrollment_id);
    const lesson = lessonById.get(lessonProgress.lesson_id);
    if (!enrollment || !lesson || lesson.course_id !== enrollment.course_id) return [];
    const course = courseById.get(enrollment.course_id);
    const module = moduleById.get(lesson.module_id);
    if (!course || !module || module.course_id !== enrollment.course_id) return [];

    return [{
      course,
      module,
      lesson,
      lessonProgress,
      courseProgress: summaryByEnrollment.get(enrollment.id) ?? null,
    }];
  });
}

export async function enrollInFreeCourse(courseId: string): Promise<EnrollInFreeCourseResult> {
  await requireAuthenticatedUserId();
  const { data, error } = await supabase.rpc('enroll_in_free_course', {
    p_course_id: courseId,
  });

  if (error) throwQueryError(error);
  const result = (data as EnrollInFreeCourseResult[] | null)?.[0];
  if (!result) throw new Error('The enrollment request returned no enrollment.');
  return result;
}

export async function saveLessonProgress(
  input: LessonProgressSaveInput,
): Promise<SaveLessonProgressResult> {
  await requireAuthenticatedUserId();
  if (!Number.isInteger(input.lastPositionSeconds) || input.lastPositionSeconds < 0) {
    throw new Error('Lesson position must be a nonnegative whole number of seconds.');
  }
  if (!Number.isInteger(input.accumulatedWatchSeconds) || input.accumulatedWatchSeconds < 0) {
    throw new Error('Accumulated watch time must be a nonnegative whole number of seconds.');
  }

  const { data, error } = await supabase.rpc('save_lesson_progress', {
    p_lesson_id: input.lessonId,
    p_last_position_seconds: input.lastPositionSeconds,
    p_accumulated_watch_seconds: input.accumulatedWatchSeconds,
    p_article_completion_requested: input.articleCompletionRequested ?? false,
  });

  if (error) throwQueryError(error);
  const result = (data as SaveLessonProgressResult[] | null)?.[0];
  if (!result) throw new Error('The progress request returned no course summary.');
  return result;
}

export async function saveLessonReflection(
  lessonId: string,
  response: string,
): Promise<SaveLessonReflectionResult> {
  await requireAuthenticatedUserId();
  if (!response.trim()) throw new Error('Write a reflection before saving.');

  const { data, error } = await supabase.rpc('save_lesson_reflection', {
    p_lesson_id: lessonId,
    p_response: response,
  });

  if (error) throwQueryError(error);
  const result = (data as SaveLessonReflectionResult[] | null)?.[0];
  if (!result) throw new Error('The reflection request returned no saved reflection.');
  return result;
}
