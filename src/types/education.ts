export type CourseStatus = 'draft' | 'published' | 'archived';
export type LessonStatus = 'draft' | 'published' | 'archived';
export type LessonContentType = 'video' | 'article' | 'reflection';
export type EnrollmentStatus = 'active' | 'revoked';
export type EnrollmentAccessSource = 'free' | 'purchase' | 'admin_grant';
export type CourseProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  thumbnail_url: string | null;
  is_free: boolean;
  status: CourseStatus;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  module_id: string;
  course_id: string;
  title: string;
  description: string | null;
  content_type: LessonContentType;
  media_url: string | null;
  content_body: string | null;
  duration_minutes: number;
  reflection_prompts: string[];
  status: LessonStatus;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CourseEnrollment {
  id: string;
  user_id: string;
  course_id: string;
  status: EnrollmentStatus;
  access_source: EnrollmentAccessSource;
  enrolled_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserLessonProgress {
  id: string;
  enrollment_id: string;
  course_id: string;
  lesson_id: string;
  last_position_seconds: number;
  accumulated_watch_seconds: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCourseProgress {
  enrollment_id: string;
  completed_lesson_count: number;
  total_lesson_count: number;
  progress_percentage: number;
  status: CourseProgressStatus;
  completed_at: string | null;
  updated_at: string;
}

export interface UserReflection {
  id: string;
  enrollment_id: string;
  course_id: string;
  lesson_id: string;
  response: string;
  created_at: string;
  updated_at: string;
}

export interface LessonProgressSaveInput {
  lessonId: string;
  lastPositionSeconds: number;
  accumulatedWatchSeconds: number;
  articleCompletionRequested?: boolean;
}

export interface EnrollInFreeCourseResult {
  enrollment_id: string;
  course_id: string;
  status: EnrollmentStatus;
  access_source: EnrollmentAccessSource;
  enrolled_at: string;
}

export interface SaveLessonProgressResult {
  enrollment_id: string;
  completed_lesson_count: number;
  total_lesson_count: number;
  progress_percentage: number;
  status: CourseProgressStatus;
  completed_at: string | null;
}

export interface SaveLessonReflectionResult {
  reflection_id: string;
  lesson_id: string;
  response: string;
  updated_at: string;
}
