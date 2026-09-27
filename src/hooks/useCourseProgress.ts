import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  enrollInFreeCourse as enrollInFreeCourseRequest,
  getMyEducationState,
  saveLessonProgress as saveLessonProgressRequest,
  saveLessonReflection as saveLessonReflectionRequest,
} from '@/lib/educationService';
import type {
  CourseEnrollment,
  LessonProgressSaveInput,
  SaveLessonProgressResult,
  UserCourseProgress,
  UserLessonProgress,
  UserReflection,
} from '@/types/education';

export interface CourseProgressView {
  courseId: string;
  enrollmentId: string;
  completedLessonCount: number;
  totalLessonCount: number;
  progressPercentage: number;
  status: UserCourseProgress['status'];
  completedAt: string | null;
  updatedAt: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load Education progress.';
}

export const useCourseProgress = () => {
  const userId = useAppStore((state) => state.user?.id ?? null);
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [lessonProgressRows, setLessonProgressRows] = useState<UserLessonProgress[]>([]);
  const [courseProgressRows, setCourseProgressRows] = useState<UserCourseProgress[]>([]);
  const [reflections, setReflections] = useState<UserReflection[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  const refreshProgress = useCallback(async (): Promise<void> => {
    if (!userId) {
      setEnrollments([]);
      setLessonProgressRows([]);
      setCourseProgressRows([]);
      setReflections([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const state = await getMyEducationState();
      setEnrollments(state.enrollments);
      setLessonProgressRows(state.lessonProgress);
      setCourseProgressRows(state.courseProgress);
      setReflections(state.reflections);
    } catch (loadError) {
      setError(toErrorMessage(loadError));
      throw loadError;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let isCurrent = true;
    if (!userId) {
      setEnrollments([]);
      setLessonProgressRows([]);
      setCourseProgressRows([]);
      setReflections([]);
      setError(null);
      setIsLoading(false);
      return () => { isCurrent = false; };
    }

    setIsLoading(true);
    setError(null);
    void getMyEducationState()
      .then((state) => {
        if (!isCurrent) return;
        setEnrollments(state.enrollments);
        setLessonProgressRows(state.lessonProgress);
        setCourseProgressRows(state.courseProgress);
        setReflections(state.reflections);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) setError(toErrorMessage(loadError));
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => { isCurrent = false; };
  }, [userId]);

  const courseProgress = useMemo(() => {
    const enrollmentsById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
    const rowsByCourse = new Map<string, CourseProgressView>();
    for (const row of courseProgressRows) {
      const enrollment = enrollmentsById.get(row.enrollment_id);
      if (!enrollment) continue;
      rowsByCourse.set(enrollment.course_id, {
        courseId: enrollment.course_id,
        enrollmentId: enrollment.id,
        completedLessonCount: row.completed_lesson_count,
        totalLessonCount: row.total_lesson_count,
        progressPercentage: row.progress_percentage,
        status: row.status,
        completedAt: row.completed_at,
        updatedAt: row.updated_at,
      });
    }
    return rowsByCourse;
  }, [courseProgressRows, enrollments]);

  const lessonProgress = useMemo(
    () => new Map(lessonProgressRows.map((row) => [row.lesson_id, row])),
    [lessonProgressRows],
  );

  const enrollInFreeCourse = useCallback(async (courseId: string) => {
    if (!userId) throw new Error('Sign in before enrolling in a course.');
    const result = await enrollInFreeCourseRequest(courseId);
    try {
      await refreshProgress();
    } catch (refreshError) {
      throw new Error(`Enrollment succeeded, but refreshing your enrollment failed: ${toErrorMessage(refreshError)}`);
    }
    return result;
  }, [refreshProgress, userId]);

  const saveLessonProgress = useCallback(async (
    input: LessonProgressSaveInput,
  ): Promise<SaveLessonProgressResult> => {
    if (!userId) throw new Error('Sign in before saving lesson progress.');
    const result = await saveLessonProgressRequest(input);
    await refreshProgress();
    return result;
  }, [refreshProgress, userId]);

  const saveLessonReflection = useCallback(async (lessonId: string, response: string) => {
    if (!userId) throw new Error('Sign in before saving a reflection.');
    const result = await saveLessonReflectionRequest(lessonId, response);
    await refreshProgress();
    return result;
  }, [refreshProgress, userId]);

  const getCourseProgress = useCallback(
    (courseId: string): CourseProgressView | null => courseProgress.get(courseId) ?? null,
    [courseProgress],
  );

  const getLessonProgress = useCallback(
    (lessonId: string): UserLessonProgress | null => lessonProgress.get(lessonId) ?? null,
    [lessonProgress],
  );

  const getLessonReflections = useCallback(
    (lessonId: string): UserReflection[] => reflections.filter((row) => row.lesson_id === lessonId),
    [reflections],
  );

  const isLessonCompleted = useCallback(
    (lessonId: string): boolean => lessonProgress.get(lessonId)?.is_completed ?? false,
    [lessonProgress],
  );

  return {
    enrollments,
    lessonProgress,
    courseProgress,
    reflections,
    isLoading,
    error,
    refreshProgress,
    refreshAfterEnrollment: refreshProgress,
    enrollInFreeCourse,
    saveLessonProgress,
    saveLessonReflection,
    getLessonProgress,
    getCourseProgress,
    getLessonReflections,
    isLessonCompleted,
  };
};

export default useCourseProgress;
