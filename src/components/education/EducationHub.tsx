import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useCourseProgress } from '@/hooks/useCourseProgress';
import { getAccessibleLessons, getPublishedCourseModules, getPublishedCourses } from '@/lib/educationService';
import type { Course, CourseModule, Lesson } from '@/types/education';
import { VideoPlayer } from '../video/VideoPlayer';
import { Button } from '../ui/button';
import { ProgressBar } from '../ui/ProgressBar';
import { BookIcon, CheckCircleIcon, ClockIcon, PlayIcon } from '../ui/Icons';

export const EducationHub: React.FC = () => {
  const userId = useAppStore((state) => state.user?.id ?? null);
  const resumeTarget = useAppStore((state) => state.educationResumeTarget);
  const setEducationResumeTarget = useAppStore((state) => state.setEducationResumeTarget);
  const {
    enrollments,
    getCourseProgress,
    getLessonReflections,
    isLessonCompleted,
    enrollInFreeCourse,
    saveLessonProgress,
    saveLessonReflection,
    refreshProgress,
    isLoading: progressLoading,
    error: progressError,
  } = useCourseProgress();

  const [courses, setCourses] = useState<Course[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [detailsLoadedCourseId, setDetailsLoadedCourseId] = useState<string | null>(null);
  const [enrollingCourseId, setEnrollingCourseId] = useState<string | null>(null);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [lessonSaveError, setLessonSaveError] = useState<string | null>(null);
  const [isSavingLesson, setIsSavingLesson] = useState(false);
  const [reflectionSaveError, setReflectionSaveError] = useState<string | null>(null);
  const [reflectionSaveSucceeded, setReflectionSaveSucceeded] = useState(false);
  const [isSavingReflection, setIsSavingReflection] = useState(false);

  const activeEnrollment = useMemo(() => {
    if (!selectedCourse) return null;
    return enrollments.find(
      (enrollment) => enrollment.course_id === selectedCourse.id && enrollment.status === 'active',
    ) ?? null;
  }, [enrollments, selectedCourse]);

  const loadCatalog = useCallback(async () => {
    if (!userId) {
      setCourses([]);
      setCatalogError('Sign in to view Education courses.');
      setCatalogLoading(false);
      return;
    }

    setCatalogLoading(true);
    setCatalogError(null);
    try {
      setCourses(await getPublishedCourses());
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Unable to load courses.');
      setCourses([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!resumeTarget || catalogLoading || catalogError) return;
    const course = courses.find((row) => row.id === resumeTarget.courseId);
    if (course) setSelectedCourse(course);
    else setEducationResumeTarget(null);
  }, [catalogError, catalogLoading, courses, resumeTarget, setEducationResumeTarget]);

  useEffect(() => {
    let current = true;
    if (!selectedCourse) {
      setModules([]);
      setLessons([]);
      setDetailsLoadedCourseId(null);
      setDetailError(null);
      setDetailLoading(false);
      return () => { current = false; };
    }

    setDetailLoading(true);
    setDetailError(null);
    setModules([]);
    setLessons([]);
    setDetailsLoadedCourseId(null);
    const courseId = selectedCourse.id;
    const canReadPaidContent = selectedCourse.is_free || enrollments.some(
      (enrollment) => enrollment.course_id === courseId && enrollment.status === 'active',
    );

    void Promise.all([
      getPublishedCourseModules(courseId),
      canReadPaidContent ? getAccessibleLessons(courseId) : Promise.resolve([] as Lesson[]),
    ])
      .then(([loadedModules, loadedLessons]) => {
        if (!current) return;
        setModules(loadedModules);
        const moduleOrder = new Map(loadedModules.map((module, index) => [module.id, index]));
        setLessons([...loadedLessons].sort((a, b) => {
          const orderDifference = (moduleOrder.get(a.module_id) ?? 0) - (moduleOrder.get(b.module_id) ?? 0);
          return orderDifference || a.display_order - b.display_order;
        }));
        setDetailsLoadedCourseId(courseId);
      })
      .catch((error: unknown) => {
        if (current) setDetailError(error instanceof Error ? error.message : 'Unable to load this course.');
      })
      .finally(() => {
        if (current) setDetailLoading(false);
      });

    return () => { current = false; };
  }, [selectedCourse, enrollments]);

  useEffect(() => {
    if (!resumeTarget || !selectedCourse || detailsLoadedCourseId !== resumeTarget.courseId) return;
    if (selectedCourse.id === resumeTarget.courseId) {
      const lesson = lessons.find((row) => row.id === resumeTarget.lessonId);
      if (lesson) setSelectedLesson(lesson);
      setEducationResumeTarget(null);
    }
  }, [detailsLoadedCourseId, lessons, resumeTarget, selectedCourse, setEducationResumeTarget]);

  const handleEnroll = async (course: Course) => {
    if (!userId) {
      setEnrollmentError('Sign in before enrolling in a course.');
      return;
    }
    if (!course.is_free) {
      setEnrollmentError('Paid course access is not available yet.');
      return;
    }

    setEnrollmentError(null);
    setEnrollingCourseId(course.id);
    try {
      await enrollInFreeCourse(course.id);
      setSelectedCourse(course);
    } catch (error) {
      setEnrollmentError(error instanceof Error ? error.message : 'Enrollment failed. Please try again.');
    } finally {
      setEnrollingCourseId(null);
    }
  };

  const handleArticleCompletion = async (lesson: Lesson) => {
    setLessonSaveError(null);
    setIsSavingLesson(true);
    try {
      await saveLessonProgress({
        lessonId: lesson.id,
        lastPositionSeconds: 0,
        accumulatedWatchSeconds: 0,
        articleCompletionRequested: true,
      });
    } catch (error) {
      setLessonSaveError(error instanceof Error ? error.message : 'Could not save lesson progress.');
    } finally {
      setIsSavingLesson(false);
    }
  };

  const handleReflectionSave = async (lesson: Lesson, response: string): Promise<void> => {
    setReflectionSaveError(null);
    setReflectionSaveSucceeded(false);
    setIsSavingReflection(true);
    try {
      await saveLessonReflection(lesson.id, response);
      setReflectionSaveSucceeded(true);
    } catch (error) {
      setReflectionSaveError(error instanceof Error ? error.message : 'Could not save your reflection.');
    } finally {
      setIsSavingReflection(false);
    }
  };

  const handleVideoComplete = () => {
    void refreshProgress().catch(() => {
      // The hook exposes a visible progress error state.
    });
  };

  const handleBackFromLesson = async () => {
    try {
      await refreshProgress();
    } catch {
      // The hook exposes a visible progress error on the course view.
    }
    setSelectedLesson(null);
  };

  useEffect(() => {
    setReflectionSaveError(null);
    setReflectionSaveSucceeded(false);
  }, [selectedLesson?.id]);

  if (selectedLesson && selectedCourse) {
    return (
      <LessonContent
        course={selectedCourse}
        lesson={selectedLesson}
        completed={isLessonCompleted(selectedLesson.id)}
        progressLoading={progressLoading}
        progressError={progressError}
        reflection={getLessonReflections(selectedLesson.id)[0] ?? null}
        isSavingReflection={isSavingReflection}
        reflectionSaveError={reflectionSaveError}
        reflectionSaveSucceeded={reflectionSaveSucceeded}
        isSaving={isSavingLesson}
        saveError={lessonSaveError}
        onBack={() => void handleBackFromLesson()}
        onComplete={() => void handleArticleCompletion(selectedLesson)}
        onSaveReflection={(response) => handleReflectionSave(selectedLesson, response)}
        onVideoComplete={handleVideoComplete}
        onRetryProgress={() => {
          void refreshProgress().catch(() => {
            // The hook exposes the retry failure as progressError.
          });
        }}
      />
    );
  }

  if (selectedCourse) {
    const courseProgress = getCourseProgress(selectedCourse.id);
    const courseModules = modules;
    const hasActiveEnrollment = Boolean(activeEnrollment);
    const courseLessons = lessons;

    return (
      <div className="min-h-screen bg-[#faf6f1] py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" onClick={() => setSelectedCourse(null)} className="mb-6">
            ← Back to Courses
          </Button>

          <section className="bg-white rounded-2xl p-6 shadow-sm mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                {selectedCourse.category && (
                  <p className="text-xs font-medium text-[#c4785a] uppercase tracking-wide mb-2">
                    {selectedCourse.category}
                  </p>
                )}
                <h1 className="text-2xl font-bold text-[#1e3a5f]">{selectedCourse.title}</h1>
                {selectedCourse.description && <p className="text-gray-600 mt-2">{selectedCourse.description}</p>}
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${selectedCourse.is_free
                ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                {selectedCourse.is_free ? 'FREE' : 'ACCESS UNAVAILABLE'}
              </span>
            </div>

            {courseProgress && (
              <div className="mt-6">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>{courseProgress.completedLessonCount} of {courseProgress.totalLessonCount} lessons complete</span>
                  <span className="capitalize">{courseProgress.status.replace('_', ' ')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <ProgressBar progress={courseProgress.progressPercentage} className="flex-1" />
                  <span className="font-semibold text-[#1e3a5f]">{courseProgress.progressPercentage}%</span>
                </div>
              </div>
            )}
            {hasActiveEnrollment && !courseProgress && (
              <p className="mt-5 text-sm text-gray-600">Enrolled · not started</p>
            )}

            {selectedCourse.is_free && !hasActiveEnrollment && (
              <div className="mt-6">
                <Button onClick={() => void handleEnroll(selectedCourse)} disabled={enrollingCourseId === selectedCourse.id}>
                  {enrollingCourseId === selectedCourse.id ? 'Enrolling…' : 'Enroll free and start'}
                </Button>
                {enrollmentError && <p className="mt-3 text-sm text-red-700" role="alert">{enrollmentError}</p>}
              </div>
            )}
            {!selectedCourse.is_free && !hasActiveEnrollment && (
              <p className="mt-5 text-sm text-amber-800" role="status">
                Paid course enrollment is not available yet.
              </p>
            )}
          </section>

          {progressError && <InlineError message={`Progress could not be refreshed: ${progressError}`} />}
          {detailLoading && <LoadingState label="Loading course content…" />}
          {detailError && <InlineError message={detailError} onRetry={() => setSelectedCourse({ ...selectedCourse })} />}
          {!detailLoading && !detailError && courseModules.length === 0 && (
            <EmptyPanel message="Course modules are being prepared." />
          )}
          {!detailLoading && !detailError && courseModules.length > 0 && !hasActiveEnrollment && (
            <EmptyPanel message={selectedCourse.is_free
              ? 'Enroll in this free course to start its lessons.'
              : 'Course lessons are unavailable until access is provided.'} />
          )}
          {!detailLoading && !detailError && hasActiveEnrollment && courseModules.length > 0 && courseLessons.length === 0 && (
            <EmptyPanel message="Published lessons are being prepared." />
          )}

          {!detailLoading && !detailError && hasActiveEnrollment && courseModules.map((module) => {
            const moduleLessons = courseLessons.filter((lesson) => lesson.module_id === module.id);
            return (
              <section key={module.id} className="bg-white rounded-2xl shadow-sm mb-6">
                <div className="p-6 border-b border-gray-100">
                  <h2 className="text-xl font-bold text-[#1e3a5f]">{module.title}</h2>
                  {module.description && <p className="text-gray-600 mt-1">{module.description}</p>}
                </div>
                {moduleLessons.length === 0 ? (
                  <p className="p-6 text-sm text-gray-500">Lessons are being prepared.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {moduleLessons.map((lesson) => {
                      const completed = isLessonCompleted(lesson.id);
                      return (
                        <button key={lesson.id} type="button" onClick={() => setSelectedLesson(lesson)}
                          className="w-full p-4 text-left hover:bg-gray-50 transition-colors flex items-center gap-4">
                          <span className={`w-10 h-10 rounded-full flex items-center justify-center ${completed
                            ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                            {completed ? <CheckCircleIcon size={20} /> : <PlayIcon size={16} />}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-medium text-[#1e3a5f]">{lesson.title}</span>
                            {lesson.description && <span className="block text-sm text-gray-500">{lesson.description}</span>}
                          </span>
                          <span className="text-sm text-gray-400 flex items-center gap-1">
                            <ClockIcon size={14} /> {lesson.duration_minutes} min
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf6f1] py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">Marriage Preparation</h1>
          <p className="text-gray-600">Build a strong foundation for your future marriage with our courses.</p>
        </header>

        {catalogLoading && <LoadingState label="Loading courses…" />}
        {!catalogLoading && catalogError && <InlineError message={catalogError} onRetry={() => void loadCatalog()} />}
        {!catalogLoading && !catalogError && courses.length === 0 && (
          <EmptyPanel message="Our marriage preparation courses are being prepared. Please check back soon." />
        )}

        {!catalogLoading && !catalogError && courses.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6">
            {courses.map((course) => {
              const enrollment = enrollments.find((row) => row.course_id === course.id && row.status === 'active');
              const progress = getCourseProgress(course.id);
              return (
                <article key={course.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  {course.category && <p className="text-xs uppercase tracking-wide text-[#c4785a] mb-2">{course.category}</p>}
                  <h2 className="text-xl font-bold text-[#1e3a5f]">{course.title}</h2>
                  {course.description && <p className="text-gray-600 mt-2">{course.description}</p>}
                  {progress && (
                    <div className="mt-5">
                      <div className="flex justify-between text-sm text-gray-600 mb-2">
                        <span>{progress.completedLessonCount}/{progress.totalLessonCount} lessons</span>
                        <span>{progress.progressPercentage}%</span>
                      </div>
                      <ProgressBar progress={progress.progressPercentage} />
                    </div>
                  )}
                  <div className="mt-5 flex flex-wrap gap-3">
                    {course.is_free && !enrollment && (
                      <Button onClick={() => void handleEnroll(course)} disabled={enrollingCourseId === course.id}>
                        {enrollingCourseId === course.id ? 'Enrolling…' : 'Enroll free'}
                      </Button>
                    )}
                    {enrollment && <Button variant="outline" onClick={() => setSelectedCourse(course)}>Open course</Button>}
                    {course.is_free && !enrollment && (
                      <Button variant="outline" onClick={() => setSelectedCourse(course)}>View course</Button>
                    )}
                    {!course.is_free && !enrollment && (
                      <Button variant="outline" disabled>Paid access coming later</Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {enrollmentError && !selectedCourse && <InlineError message={enrollmentError} />}
        {progressError && <p className="mt-6 text-sm text-amber-800" role="status">Progress is temporarily unavailable: {progressError}</p>}
      </div>
    </main>
  );
};

const LessonContent: React.FC<{
  course: Course;
  lesson: Lesson;
  completed: boolean;
  progressLoading: boolean;
  progressError: string | null;
  reflection: { response: string; updated_at: string } | null;
  isSavingReflection: boolean;
  reflectionSaveError: string | null;
  reflectionSaveSucceeded: boolean;
  isSaving: boolean;
  saveError: string | null;
  onBack: () => void;
  onComplete: () => void;
  onSaveReflection: (response: string) => Promise<void>;
  onVideoComplete: () => void;
  onRetryProgress: () => void;
}> = ({ course, lesson, completed, progressLoading, progressError, reflection, isSavingReflection,
  reflectionSaveError, reflectionSaveSucceeded, isSaving, saveError, onBack, onComplete,
  onSaveReflection, onVideoComplete, onRetryProgress }) => (
  <main className="min-h-screen bg-[#faf6f1] py-8">
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <Button variant="ghost" onClick={onBack} className="mb-6">← Back to {course.title}</Button>
      <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <p className="text-xs font-medium text-[#c4785a] uppercase tracking-wide">{lesson.content_type}</p>
          <h1 className="text-2xl font-bold text-[#1e3a5f] mt-2">{lesson.title}</h1>
          {lesson.description && <p className="text-gray-600 mt-2">{lesson.description}</p>}
        </div>
        <div className="p-6">
          {lesson.content_type === 'video' && lesson.media_url?.trim() && (
            <VideoPlayer videoUrl={lesson.media_url} lessonId={lesson.id} lessonTitle={lesson.title}
              durationMinutes={lesson.duration_minutes} onComplete={onVideoComplete} />
          )}
          {lesson.content_type === 'article' && lesson.content_body && (
            <div className="prose max-w-none whitespace-pre-wrap text-gray-700">{lesson.content_body}</div>
          )}
          {lesson.content_type === 'reflection' && (
            <ReflectionEditor
              lesson={lesson}
              completed={completed}
              isLoading={progressLoading}
              loadError={progressError}
              reflection={reflection}
              isSaving={isSavingReflection}
              saveError={reflectionSaveError}
              saveSucceeded={reflectionSaveSucceeded}
              onSave={onSaveReflection}
              onRetry={onRetryProgress}
            />
          )}
          {((lesson.content_type === 'video' && !lesson.media_url?.trim())
            || (lesson.content_type === 'article' && !lesson.content_body)) && (
            <div className="rounded-xl bg-[#faf6f1] p-6 text-center text-gray-600" role="status">
              This lesson’s content is being prepared.
            </div>
          )}
          {saveError && <p className="mt-4 text-sm text-red-700" role="alert">{saveError}</p>}
        </div>
        {lesson.content_type === 'article' && lesson.content_body && (
          <div className="p-6 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-500">{completed ? 'Completed' : 'Mark as complete when finished'}</span>
            <Button onClick={onComplete} disabled={completed || isSaving}>
              {isSaving ? 'Saving…' : completed ? 'Completed' : 'Mark complete'}
            </Button>
          </div>
        )}
      </section>
    </div>
  </main>
);

const ReflectionEditor: React.FC<{
  lesson: Lesson;
  completed: boolean;
  isLoading: boolean;
  loadError: string | null;
  reflection: { response: string; updated_at: string } | null;
  isSaving: boolean;
  saveError: string | null;
  saveSucceeded: boolean;
  onSave: (response: string) => Promise<void>;
  onRetry: () => void;
}> = ({ lesson, completed, isLoading, loadError, reflection, isSaving, saveError, saveSucceeded, onSave, onRetry }) => {
  const [response, setResponse] = useState(reflection?.response ?? '');

  useEffect(() => {
    setResponse(reflection?.response ?? '');
  }, [lesson.id, reflection?.response]);

  const submit = async () => {
    if (!response.trim() || isSaving) return;
    await onSave(response);
  };

  if (isLoading) return <LoadingState label="Loading your private reflection…" />;
  if (loadError) {
    return (
      <div className="space-y-3" role="alert">
        <p className="text-sm text-red-700">Your reflection could not be loaded: {loadError}</p>
        <Button variant="outline" onClick={onRetry}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {lesson.reflection_prompts.length > 0 ? (
        <div className="space-y-3">
          <h2 className="font-semibold text-[#1e3a5f]">Reflection prompts</h2>
          {lesson.reflection_prompts.map((prompt) => <p key={prompt} className="italic text-gray-600">“{prompt}”</p>)}
        </div>
      ) : (
        <p className="text-gray-600">Take a moment to reflect on this lesson.</p>
      )}
      <p className="text-sm text-gray-500">Your response is private to you.</p>
      <label className="block">
        <span className="sr-only">Your reflection</span>
        <textarea value={response} onChange={(event) => setResponse(event.target.value)} rows={6}
          className="w-full rounded-xl border border-gray-200 p-4 text-gray-700 focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/10"
          placeholder="Write one response to these prompts…" />
      </label>
      {completed && <p className="text-sm text-emerald-700" role="status">Reflection lesson completed.</p>}
      {saveSucceeded && <p className="text-sm text-emerald-700" role="status">Your reflection was saved.</p>}
      {saveError && <p className="text-sm text-red-700" role="alert">{saveError}</p>}
      <Button onClick={() => void submit()} disabled={!response.trim() || isSaving}>
        {isSaving ? 'Saving…' : reflection ? 'Save changes' : 'Save reflection'}
      </Button>
    </div>
  );
};

const LoadingState: React.FC<{ label: string }> = ({ label }) => (
  <div className="bg-white rounded-2xl p-8 shadow-sm text-center" role="status">
    <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full mx-auto mb-4" />
    <p className="text-gray-600">{label}</p>
  </div>
);

const EmptyPanel: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-white rounded-2xl p-10 shadow-sm text-center">
    <div className="w-16 h-16 rounded-full bg-[#1e3a5f]/5 flex items-center justify-center mx-auto mb-4">
      <BookIcon size={30} className="text-[#1e3a5f]" />
    </div>
    <p className="text-gray-600">{message}</p>
  </div>
);

const InlineError: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-red-800" role="alert">
    <p>{message}</p>
    {onRetry && <Button variant="outline" className="mt-3" onClick={onRetry}>Try again</Button>}
  </div>
);

export default EducationHub;
