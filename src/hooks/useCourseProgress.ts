import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/lib/store';

export interface LessonProgress {
  lessonId: string;
  courseId: string;
  watchProgress: number;
  watchTimeSeconds: number;
  totalDurationSeconds: number;
  isCompleted: boolean;
  completedAt: string | null;
  lastPosition: number;
  readinessPointsEarned: number;
}

export interface CourseProgress {
  courseId: string;
  progress: number;
  status: 'not_started' | 'in_progress' | 'completed';
  startedAt: string | null;
  completedAt: string | null;
  lastAccessed: string;
}

export interface ReflectionEntry {
  lessonId: string;
  courseId: string;
  prompt: string;
  response: string;
  createdAt: string;
}

export const useCourseProgress = () => {
  const { user, updateUser } = useAppStore();
  const [lessonProgress, setLessonProgress] = useState<Map<string, LessonProgress>>(new Map());
  const [courseProgress, setCourseProgress] = useState<Map<string, CourseProgress>>(new Map());
  const [reflections, setReflections] = useState<ReflectionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastContinueItem, setLastContinueItem] = useState<{
    type: 'course' | 'lesson';
    courseId: string;
    lessonId?: string;
    courseName: string;
    lessonName?: string;
    progress: number;
    lastAccessed: string;
  } | null>(null);

  const userId = user?.id || 'anonymous';

  // Fetch all progress data from database
  const fetchProgress = useCallback(async () => {
    if (!userId) return;
    
    setIsLoading(true);
    try {
      // Fetch course progress
      const { data: courseData, error: courseError } = await supabase
        .from('user_course_progress')
        .select('*')
        .eq('user_id', userId);

      if (courseError) throw courseError;

      const courseMap = new Map<string, CourseProgress>();
      courseData?.forEach((row) => {
        courseMap.set(row.course_id, {
          courseId: row.course_id,
          progress: row.progress,
          status: row.status,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          lastAccessed: row.last_accessed,
        });
      });
      setCourseProgress(courseMap);

      // Fetch lesson progress
      const { data: lessonData, error: lessonError } = await supabase
        .from('user_lesson_progress')
        .select('*')
        .eq('user_id', userId);

      if (lessonError) throw lessonError;

      const lessonMap = new Map<string, LessonProgress>();
      lessonData?.forEach((row) => {
        lessonMap.set(row.lesson_id, {
          lessonId: row.lesson_id,
          courseId: row.course_id,
          watchProgress: parseFloat(row.watch_progress) || 0,
          watchTimeSeconds: row.watch_time_seconds || 0,
          totalDurationSeconds: row.total_duration_seconds || 0,
          isCompleted: row.is_completed || false,
          completedAt: row.completed_at,
          lastPosition: row.last_position || 0,
          readinessPointsEarned: row.readiness_points || 0,
        });
      });
      setLessonProgress(lessonMap);

      // Fetch reflections
      const { data: reflectionData, error: reflectionError } = await supabase
        .from('user_reflections')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (reflectionError) throw reflectionError;

      setReflections(reflectionData?.map((row) => ({
        lessonId: row.lesson_id,
        courseId: row.course_id,
        prompt: row.prompt,
        response: row.response,
        createdAt: row.created_at,
      })) || []);

      // Determine last continue item
      const sortedCourses = Array.from(courseMap.values())
        .filter(c => c.status === 'in_progress')
        .sort((a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());

      if (sortedCourses.length > 0) {
        const lastCourse = sortedCourses[0];
        // Find the last incomplete lesson in this course
        const courseLessons = Array.from(lessonMap.values())
          .filter(l => l.courseId === lastCourse.courseId && !l.isCompleted);
        
        if (courseLessons.length > 0) {
          setLastContinueItem({
            type: 'lesson',
            courseId: lastCourse.courseId,
            lessonId: courseLessons[0].lessonId,
            courseName: lastCourse.courseId, // Will be resolved in component
            lessonName: courseLessons[0].lessonId, // Will be resolved in component
            progress: courseLessons[0].watchProgress,
            lastAccessed: lastCourse.lastAccessed,
          });
        } else {
          setLastContinueItem({
            type: 'course',
            courseId: lastCourse.courseId,
            courseName: lastCourse.courseId,
            progress: lastCourse.progress,
            lastAccessed: lastCourse.lastAccessed,
          });
        }
      }

    } catch (error) {
      console.error('Error fetching progress:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Save lesson progress to database
  const saveLessonProgress = useCallback(async (
    lessonId: string,
    courseId: string,
    progress: number,
    currentPosition: number,
    totalDuration: number,
    isCompleted: boolean = false,
    readinessPoints: number = 0
  ) => {
    if (!userId) return;

    try {
      const now = new Date().toISOString();
      
      // Upsert lesson progress
      const { error: lessonError } = await supabase
        .from('user_lesson_progress')
        .upsert({
          user_id: userId,
          course_id: courseId,
          lesson_id: lessonId,
          watch_progress: progress,
          watch_time_seconds: Math.floor(currentPosition),
          total_duration_seconds: Math.floor(totalDuration),
          is_completed: isCompleted,
          completed_at: isCompleted ? now : null,
          last_position: Math.floor(currentPosition),
          readiness_points: readinessPoints,
          updated_at: now,
        }, {
          onConflict: 'user_id,lesson_id',
        });

      if (lessonError) throw lessonError;

      // Update local state
      setLessonProgress(prev => {
        const newMap = new Map(prev);
        newMap.set(lessonId, {
          lessonId,
          courseId,
          watchProgress: progress,
          watchTimeSeconds: Math.floor(currentPosition),
          totalDurationSeconds: Math.floor(totalDuration),
          isCompleted,
          completedAt: isCompleted ? now : null,
          lastPosition: Math.floor(currentPosition),
          readinessPointsEarned: readinessPoints,
        });
        return newMap;
      });

      // Update course progress
      await updateCourseProgress(courseId);

      // If completed, record readiness score
      if (isCompleted && readinessPoints > 0) {
        await recordReadinessScore(readinessPoints, 'lesson', lessonId);
      }

    } catch (error) {
      console.error('Error saving lesson progress:', error);
    }
  // Both helpers are memoized by userId and declared below to keep this flow grouped.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Update course progress based on lesson completions
  const updateCourseProgress = useCallback(async (courseId: string) => {
    if (!userId) return;

    try {
      // Get all lessons for this course
      const { data: lessons, error: lessonsError } = await supabase
        .from('user_lesson_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('course_id', courseId);

      if (lessonsError) throw lessonsError;

      const completedCount = lessons?.filter((lesson) => lesson.is_completed).length || 0;
      const totalCount = lessons?.length || 1;
      const progress = Math.round((completedCount / totalCount) * 100);
      const status = completedCount === 0 ? 'not_started' : 
                     completedCount === totalCount ? 'completed' : 'in_progress';

      const now = new Date().toISOString();

      // Upsert course progress
      const { error: courseError } = await supabase
        .from('user_course_progress')
        .upsert({
          user_id: userId,
          course_id: courseId,
          progress,
          status,
          started_at: status !== 'not_started' ? now : null,
          completed_at: status === 'completed' ? now : null,
          last_accessed: now,
          updated_at: now,
        }, {
          onConflict: 'user_id,course_id',
        });

      if (courseError) throw courseError;

      // Update local state
      setCourseProgress(prev => {
        const newMap = new Map(prev);
        newMap.set(courseId, {
          courseId,
          progress,
          status: status as CourseProgress['status'],
          startedAt: status !== 'not_started' ? now : null,
          completedAt: status === 'completed' ? now : null,
          lastAccessed: now,
        });
        return newMap;
      });

    } catch (error) {
      console.error('Error updating course progress:', error);
    }
  }, [userId]);

  // Record readiness score change
  const recordReadinessScore = useCallback(async (
    pointsEarned: number,
    source: string,
    sourceId: string
  ) => {
    if (!userId || !user) return;

    try {
      const newScore = Math.min(100, (user.readinessScore || 0) + pointsEarned);

      // Record in database
      const { error } = await supabase
        .from('user_readiness_scores')
        .insert({
          user_id: userId,
          score: newScore,
          source,
          source_id: sourceId,
          points_earned: pointsEarned,
        });

      if (error) throw error;

      // Update user's readiness score in store
      updateUser({ readinessScore: newScore });

    } catch (error) {
      console.error('Error recording readiness score:', error);
    }
  }, [userId, user, updateUser]);

  // Save reflection
  const saveReflection = useCallback(async (
    lessonId: string,
    courseId: string,
    prompt: string,
    response: string
  ) => {
    if (!userId || !response.trim()) return;

    try {
      const { error } = await supabase
        .from('user_reflections')
        .insert({
          user_id: userId,
          course_id: courseId,
          lesson_id: lessonId,
          prompt,
          response,
        });

      if (error) throw error;

      // Update local state
      setReflections(prev => [{
        lessonId,
        courseId,
        prompt,
        response,
        createdAt: new Date().toISOString(),
      }, ...prev]);

    } catch (error) {
      console.error('Error saving reflection:', error);
    }
  }, [userId]);

  // Get lesson progress by ID
  const getLessonProgress = useCallback((lessonId: string): LessonProgress | null => {
    return lessonProgress.get(lessonId) || null;
  }, [lessonProgress]);

  // Get course progress by ID
  const getCourseProgress = useCallback((courseId: string): CourseProgress | null => {
    return courseProgress.get(courseId) || null;
  }, [courseProgress]);

  // Get reflections for a lesson
  const getLessonReflections = useCallback((lessonId: string): ReflectionEntry[] => {
    return reflections.filter(r => r.lessonId === lessonId);
  }, [reflections]);

  // Check if lesson is completed
  const isLessonCompleted = useCallback((lessonId: string): boolean => {
    return lessonProgress.get(lessonId)?.isCompleted || false;
  }, [lessonProgress]);

  // Get total readiness points earned
  const getTotalReadinessPoints = useCallback((): number => {
    let total = 0;
    lessonProgress.forEach(lp => {
      total += lp.readinessPointsEarned;
    });
    return total;
  }, [lessonProgress]);

  // Load progress on mount
  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return {
    lessonProgress,
    courseProgress,
    reflections,
    isLoading,
    lastContinueItem,
    saveLessonProgress,
    updateCourseProgress,
    saveReflection,
    getLessonProgress,
    getCourseProgress,
    getLessonReflections,
    isLessonCompleted,
    getTotalReadinessPoints,
    recordReadinessScore,
    refreshProgress: fetchProgress,
  };
};

export default useCourseProgress;
