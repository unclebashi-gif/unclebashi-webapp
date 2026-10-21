import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { AdminCourseLessonsPanel } from './AdminCourseLessonsPanel';
import { getAdminModuleLessonCounts } from '@/lib/adminLessonService';
import { updateAdminCourseCommercialTerms } from '@/lib/adminService';
import {
  createAdminCourse,
  createAdminCourseModule,
  getAdminCourseModuleCounts,
  getAdminCoursePublicationReadiness,
  getAdminCourseModules,
  getAdminCourses,
  normalizeCourseMetadata,
  reorderAdminCourseModules,
  updateAdminCourseModule,
  updateAdminCourseMetadata,
  updateAdminCourseStatus,
} from '@/lib/adminCourseService';
import type { AdminCoursePublicationReadiness } from '@/lib/adminCourseService';
import type { Course, CourseAudienceGender, CourseModule, CourseStatus } from '@/types/education';

interface CourseDraft {
  title: string;
  slug: string;
  description: string;
  category: string;
  thumbnailUrl: string;
  audienceGender: CourseAudienceGender;
  displayOrder: string;
  isFree: boolean;
  price: string;
}

type CourseEditor = { mode: 'create' } | { mode: 'edit'; course: Course };
type ModuleEditor = { courseId: string; moduleId: string | null };

const audienceLabels: Record<CourseAudienceGender, string> = {
  all: 'Everyone',
  female: 'Women',
  male: 'Men',
};

const statusStyles: Record<CourseStatus, string> = {
  draft: 'bg-amber-100 text-amber-800',
  published: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-gray-100 text-gray-700',
};

const blankDraft = (): CourseDraft => ({
  title: '',
  slug: '',
  description: '',
  category: '',
  thumbnailUrl: '',
  audienceGender: 'all',
  displayOrder: '0',
  isFree: true,
  price: '',
});

function draftFromCourse(course: Course): CourseDraft {
  return {
    title: course.title,
    slug: course.slug,
    description: course.description ?? '',
    category: course.category ?? '',
    thumbnailUrl: course.thumbnail_url ?? '',
    audienceGender: course.audience_gender,
    displayOrder: String(course.display_order),
    isFree: course.is_free,
    price: course.price_amount?.toString() ?? '',
  };
}

function priceFromDraft(draft: CourseDraft): number | null {
  if (draft.isFree) return null;
  const raw = draft.price.trim();
  if (!/^\d+$/.test(raw)) throw new Error('Enter a positive whole-number price in UGX.');
  const amount = Number(raw);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Enter a positive whole-number price in UGX.');
  }
  return amount;
}

function formatPrice(course: Course): string {
  if (course.is_free) return 'Free';
  if (course.currency !== 'UGX' || course.price_amount === null || !Number.isSafeInteger(course.price_amount)) {
    return 'Pricing incomplete';
  }
  return `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(course.price_amount)}`;
}

function statusAction(course: Course): { label: string; status: CourseStatus } | null {
  if (course.slug.startsWith('sandbox-')) {
    return course.status === 'draft' ? null : { label: 'Return to draft', status: 'draft' };
  }
  if (course.status === 'published') return { label: 'Move to draft', status: 'draft' };
  if (course.status === 'draft') return { label: 'Archive draft', status: 'archived' };
  return { label: 'Restore to draft', status: 'draft' };
}

export const AdminCoursesPanel: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [publicationReadiness, setPublicationReadiness] = useState<Record<string, AdminCoursePublicationReadiness>>({});
  const [readinessErrors, setReadinessErrors] = useState<Record<string, string>>({});
  const [readinessLoadingIds, setReadinessLoadingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const [editor, setEditor] = useState<CourseEditor | null>(null);
  const [draft, setDraft] = useState<CourseDraft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [expandedModuleCourseId, setExpandedModuleCourseId] = useState<string | null>(null);
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({});
  const [moduleCountError, setModuleCountError] = useState('');
  const [modulesByCourse, setModulesByCourse] = useState<Record<string, CourseModule[]>>({});
  const [lessonCountsByModule, setLessonCountsByModule] = useState<Record<string, number>>({});
  const [moduleLoadingIds, setModuleLoadingIds] = useState<Set<string>>(new Set());
  const [moduleErrors, setModuleErrors] = useState<Record<string, string>>({});
  const [moduleNotices, setModuleNotices] = useState<Record<string, string>>({});
  const [moduleEditor, setModuleEditor] = useState<ModuleEditor | null>(null);
  const [moduleTitleDraft, setModuleTitleDraft] = useState('');
  const [moduleDescriptionDraft, setModuleDescriptionDraft] = useState('');
  const [moduleSaving, setModuleSaving] = useState(false);
  const [moduleOrderSavingCourseId, setModuleOrderSavingCourseId] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const rows = await getAdminCourses();
      setCourses(rows);
      setModuleCountError('');
      try {
        setModuleCounts(await getAdminCourseModuleCounts(rows.map((course) => course.id)));
      } catch (error) {
        setModuleCountError(error instanceof Error ? error.message : 'Could not load module counts.');
      }

      const coursesToCheck = rows.filter((course) =>
        course.status === 'draft' && !course.slug.startsWith('sandbox-'),
      );
      setReadinessLoadingIds(new Set(coursesToCheck.map((course) => course.id)));
      const checks = await Promise.allSettled(
        coursesToCheck.map((course) => getAdminCoursePublicationReadiness(course.id)),
      );
      const nextReadiness: Record<string, AdminCoursePublicationReadiness> = {};
      const nextReadinessErrors: Record<string, string> = {};
      checks.forEach((check, index) => {
        const courseId = coursesToCheck[index].id;
        if (check.status === 'fulfilled') {
          nextReadiness[courseId] = check.value;
        } else {
          nextReadinessErrors[courseId] = check.reason instanceof Error
            ? check.reason.message
            : 'Could not check publication readiness.';
        }
      });
      setPublicationReadiness(nextReadiness);
      setReadinessErrors(nextReadinessErrors);
      setReadinessLoadingIds(new Set());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load courses.');
      setReadinessLoadingIds(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCourses(); }, [loadCourses]);

  const openCreate = () => {
    setDraft(blankDraft());
    setSaveError('');
    setSuccess('');
    setEditor({ mode: 'create' });
  };

  const openEdit = (course: Course) => {
    setDraft(draftFromCourse(course));
    setSaveError('');
    setSuccess('');
    setEditor({ mode: 'edit', course });
  };

  const updateDraft = <K extends keyof CourseDraft>(key: K, value: CourseDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveCourse = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaveError('');
    setSuccess('');

    if (!draft.title.trim()) {
      setSaveError('Course title is required.');
      return;
    }
    if (editor?.mode === 'create' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug.trim())) {
      setSaveError('Use a unique lowercase slug with letters, numbers, and single hyphens.');
      return;
    }

    let metadata;
    let priceAmount: number | null;
    try {
      metadata = normalizeCourseMetadata(draft);
      priceAmount = priceFromDraft(draft);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Review the course details and try again.');
      return;
    }

    setSaving(true);
    let metadataSaved = false;
    try {
      let course: Course;
      if (editor?.mode === 'edit') {
        course = await updateAdminCourseMetadata(editor.course.id, metadata);
        metadataSaved = true;
      } else if (editor?.mode === 'create') {
        course = await createAdminCourse({ ...metadata, slug: draft.slug.trim() });
        metadataSaved = true;
      } else {
        return;
      }

      try {
        await updateAdminCourseCommercialTerms({
          courseId: course.id,
          isFree: draft.isFree,
          priceAmount,
        });
      } catch (error) {
        await loadCourses();
        if (editor.mode === 'create') setEditor({ mode: 'edit', course });
        setSaveError(`Course details were saved, but commercial terms were not: ${error instanceof Error ? error.message : 'please retry.'}`);
        return;
      }

      await loadCourses();
      setSuccess(editor.mode === 'create' ? 'Draft course created.' : 'Course details saved.');
      setEditor(null);
    } catch (error) {
      if (metadataSaved) await loadCourses();
      setSaveError(error instanceof Error ? error.message : 'Could not save course details.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (course: Course, nextStatus: CourseStatus) => {
    setStatusSavingId(course.id);
    setSaveError('');
    setSuccess('');
    try {
      await updateAdminCourseStatus(course, nextStatus);
      await loadCourses();
      setSuccess(`Course moved to ${nextStatus}.`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update course status.');
    } finally {
      setStatusSavingId(null);
    }
  };

  const loadModules = async (courseId: string) => {
    setModuleLoadingIds((current) => new Set(current).add(courseId));
    setModuleErrors((current) => ({ ...current, [courseId]: '' }));
    try {
      const rows = await getAdminCourseModules(courseId);
      setModulesByCourse((current) => ({ ...current, [courseId]: rows }));
      try {
        const counts = await getAdminModuleLessonCounts(rows.map((module) => module.id));
        setLessonCountsByModule((current) => ({ ...current, ...counts }));
      } catch (error) {
        setModuleErrors((current) => ({
          ...current,
          [courseId]: error instanceof Error ? error.message : 'Could not load lesson counts.',
        }));
      }
    } catch (error) {
      setModuleErrors((current) => ({
        ...current,
        [courseId]: error instanceof Error ? error.message : 'Could not load course modules.',
      }));
    } finally {
      setModuleLoadingIds((current) => {
        const next = new Set(current);
        next.delete(courseId);
        return next;
      });
    }
  };

  const toggleModules = (courseId: string) => {
    if (expandedModuleCourseId === courseId) {
      setExpandedModuleCourseId(null);
      setModuleEditor(null);
      return;
    }
    setExpandedModuleCourseId(courseId);
    setModuleEditor(null);
    void loadModules(courseId);
  };

  const openModuleEditor = (courseId: string, module: CourseModule | null) => {
    setModuleErrors((current) => ({ ...current, [courseId]: '' }));
    setModuleNotices((current) => ({ ...current, [courseId]: '' }));
    setModuleTitleDraft(module?.title ?? '');
    setModuleDescriptionDraft(module?.description ?? '');
    setModuleEditor({ courseId, moduleId: module?.id ?? null });
  };

  const saveModule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!moduleEditor) return;
    const { courseId, moduleId } = moduleEditor;
    setModuleSaving(true);
    setModuleErrors((current) => ({ ...current, [courseId]: '' }));
    setModuleNotices((current) => ({ ...current, [courseId]: '' }));
    try {
      if (moduleId) {
        await updateAdminCourseModule(moduleId, moduleTitleDraft, moduleDescriptionDraft);
      } else {
        await createAdminCourseModule(courseId, moduleTitleDraft, moduleDescriptionDraft);
      }
      setModuleEditor(null);
      await Promise.all([loadModules(courseId), loadCourses()]);
      setModuleNotices((current) => ({
        ...current,
        [courseId]: moduleId ? 'Module updated.' : 'Module added.',
      }));
    } catch (error) {
      setModuleErrors((current) => ({
        ...current,
        [courseId]: error instanceof Error ? error.message : 'Could not save the module.',
      }));
    } finally {
      setModuleSaving(false);
    }
  };

  const moveModule = async (courseId: string, moduleIndex: number, direction: -1 | 1) => {
    const rows = modulesByCourse[courseId] ?? [];
    const targetIndex = moduleIndex + direction;
    if (targetIndex < 0 || targetIndex >= rows.length) return;
    const reordered = [...rows];
    [reordered[moduleIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[moduleIndex]];
    setModuleOrderSavingCourseId(courseId);
    setModuleErrors((current) => ({ ...current, [courseId]: '' }));
    setModuleNotices((current) => ({ ...current, [courseId]: '' }));
    try {
      await reorderAdminCourseModules(courseId, reordered.map((module) => module.id));
      await Promise.all([loadModules(courseId), loadCourses()]);
      setModuleNotices((current) => ({ ...current, [courseId]: 'Module order updated.' }));
    } catch (error) {
      setModuleErrors((current) => ({
        ...current,
        [courseId]: error instanceof Error ? error.message : 'Could not reorder modules.',
      }));
      await loadModules(courseId);
    } finally {
      setModuleOrderSavingCourseId(null);
    }
  };

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#1e3a5f]">Course Manager</h2>
          <p className="mt-1 text-sm text-gray-500">Manage course details and commercial terms. New courses start as drafts.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadCourses()} disabled={loading}>Refresh</Button>
          <Button size="sm" onClick={openCreate}>Create course</Button>
        </div>
      </div>

      {success && <p className="mb-4 text-sm text-emerald-700" role="status">{success}</p>}
      {saveError && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{saveError}</p>}
      {loadError && <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-800" role="alert"><p>{loadError}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void loadCourses()}>Retry</Button></div>}
      {loading && <p className="text-sm text-gray-500" role="status">Loading courses…</p>}
      {!loading && !loadError && courses.length === 0 && <p className="text-gray-500">No courses are available to manage yet.</p>}

      <div className="space-y-3">
        {courses.map((course) => {
          const sandbox = course.slug.startsWith('sandbox-');
          const action = statusAction(course);
          const readiness = publicationReadiness[course.id];
          const readinessLoading = readinessLoadingIds.has(course.id);
          const readinessError = readinessErrors[course.id];
          const modules = modulesByCourse[course.id] ?? [];
          const modulesLoading = moduleLoadingIds.has(course.id);
          const moduleEditingThisCourse = moduleEditor?.courseId === course.id;
          const modulesEditable = course.status === 'draft';
          return (
            <article key={course.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[#1e3a5f]">{course.title}</h3>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusStyles[course.status]}`}>{course.status}</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${course.is_free ? 'bg-sky-100 text-sky-800' : 'bg-purple-100 text-purple-800'}`}>{course.is_free ? 'Free' : 'Paid'}</span>
                    {sandbox && <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">Sandbox/Test</span>}
                  </div>
                  <p className="break-all text-sm text-gray-500">{course.slug}</p>
                  <div className="mt-3 grid gap-x-6 gap-y-1 text-sm text-gray-600 sm:grid-cols-2 xl:grid-cols-3">
                    <p>Price: <span className="font-medium text-gray-800">{formatPrice(course)}</span></p>
                    <p>Audience: <span className="font-medium text-gray-800">{audienceLabels[course.audience_gender]}</span></p>
                    <p>Category: <span className="font-medium text-gray-800">{course.category || '—'}</span></p>
                    <p>Display order: <span className="font-medium text-gray-800">{course.display_order}</span></p>
                    <p>Updated: <span className="font-medium text-gray-800">{new Date(course.updated_at).toLocaleDateString()}</span></p>
                  </div>
                  {sandbox && <p className="mt-2 text-xs text-orange-800">Preserved for payment history. Sandbox/test courses cannot be published.</p>}
                  {course.status === 'draft' && !sandbox && readinessLoading && <p className="mt-2 text-xs text-gray-500" role="status">Checking publication readiness…</p>}
                  {course.status === 'draft' && !sandbox && readinessError && <p className="mt-2 text-xs text-red-700" role="alert">Could not check publication readiness: {readinessError}</p>}
                  {course.status === 'draft' && !sandbox && readiness && (
                    readiness.can_publish
                      ? <p className="mt-2 text-xs font-medium text-emerald-700">Ready to publish.</p>
                      : <div className="mt-2 text-xs text-gray-600">
                        <p>This course is not ready to publish:</p>
                        <ul className="mt-1 list-inside list-disc">
                          {readiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                      </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(course)}>Edit course</Button>
                  {action && <Button variant="outline" size="sm" disabled={statusSavingId === course.id} onClick={() => void changeStatus(course, action.status)}>{statusSavingId === course.id ? 'Saving…' : action.label}</Button>}
                  {course.status === 'draft' && <Button
                    variant="outline"
                    size="sm"
                    disabled={sandbox || !readiness?.can_publish || readinessLoading || Boolean(readinessError) || statusSavingId === course.id}
                    title={sandbox ? 'Sandbox/test courses cannot be published' : readiness?.can_publish ? 'Publish this course' : 'Course content and commercial terms must pass publication readiness'}
                    onClick={() => void changeStatus(course, 'published')}
                  >{statusSavingId === course.id ? 'Saving…' : 'Publish'}</Button>}
                </div>
              </div>
              <div className="mt-4 border-t border-gray-100 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold">Modules</span>
                    <span className="ml-2 text-gray-500">{moduleCounts[course.id] ?? '—'}</span>
                  </p>
                  <Button variant="outline" size="sm" onClick={() => toggleModules(course.id)}>
                    {expandedModuleCourseId === course.id ? 'Hide modules' : 'View modules'}
                  </Button>
                </div>
                {moduleCountError && <p className="mt-2 text-xs text-red-700" role="alert">Module counts could not be loaded: {moduleCountError}</p>}
                {expandedModuleCourseId === course.id && (
                  <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
                    {!modulesEditable && <p className="text-sm text-amber-800">
                      {course.status === 'published'
                        ? 'Return this course to Draft before editing its modules.'
                        : 'Restore this course to Draft before editing its modules.'}
                    </p>}
                    {moduleNotices[course.id] && <p className="text-sm text-emerald-700" role="status">{moduleNotices[course.id]}</p>}
                    {moduleErrors[course.id] && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
                      <p>{moduleErrors[course.id]}</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadModules(course.id)}>Retry</Button>
                    </div>}
                    {modulesLoading && <p className="text-sm text-gray-500" role="status">Loading modules…</p>}
                    {!modulesLoading && !moduleErrors[course.id] && modules.length === 0 && <p className="text-sm text-gray-500">No modules have been added yet.</p>}
                    {!modulesLoading && modules.map((module, index) => {
                      const editing = moduleEditor?.courseId === course.id && moduleEditor.moduleId === module.id;
                      return (
                        <div key={module.id} className="rounded-lg border border-gray-200 bg-white p-3">
                          {editing ? (
                            <form className="space-y-3" onSubmit={(event) => void saveModule(event)}>
                              <label className="block text-sm font-medium text-gray-700">
                                Module title
                                <input required maxLength={200} value={moduleTitleDraft} onChange={(event) => setModuleTitleDraft(event.target.value)} className={inputClass} />
                              </label>
                              <label className="block text-sm font-medium text-gray-700">
                                Description
                                <textarea rows={2} value={moduleDescriptionDraft} onChange={(event) => setModuleDescriptionDraft(event.target.value)} className={inputClass} />
                              </label>
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => setModuleEditor(null)} disabled={moduleSaving}>Cancel</Button>
                                <Button type="submit" size="sm" disabled={moduleSaving}>{moduleSaving ? 'Saving…' : 'Save module'}</Button>
                              </div>
                            </form>
                          ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="font-medium text-[#1e3a5f]">{index + 1}. {module.title}</p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{module.description || 'No description.'}</p>
                              </div>
                              {modulesEditable && <div className="flex shrink-0 flex-wrap gap-2">
                                <Button variant="outline" size="sm" onClick={() => void moveModule(course.id, index, -1)} disabled={index === 0 || moduleOrderSavingCourseId === course.id || moduleSaving}>Move up</Button>
                                <Button variant="outline" size="sm" onClick={() => void moveModule(course.id, index, 1)} disabled={index === modules.length - 1 || moduleOrderSavingCourseId === course.id || moduleSaving}>Move down</Button>
                                <Button variant="outline" size="sm" onClick={() => openModuleEditor(course.id, module)} disabled={moduleSaving || moduleOrderSavingCourseId === course.id}>Edit</Button>
                              </div>}
                            </div>
                          )}
                          <AdminCourseLessonsPanel
                            module={module}
                            courseStatus={course.status}
                            lessonCount={lessonCountsByModule[module.id]}
                            onLessonChanged={async () => {
                              await Promise.all([loadModules(course.id), loadCourses()]);
                            }}
                          />
                        </div>
                      );
                    })}
                    {moduleEditingThisCourse && moduleEditor.moduleId === null && (
                      <form className="space-y-3 rounded-lg border border-dashed border-gray-300 bg-white p-3" onSubmit={(event) => void saveModule(event)}>
                        <label className="block text-sm font-medium text-gray-700">
                          Module title
                          <input required maxLength={200} value={moduleTitleDraft} onChange={(event) => setModuleTitleDraft(event.target.value)} className={inputClass} />
                        </label>
                        <label className="block text-sm font-medium text-gray-700">
                          Description
                          <textarea rows={2} value={moduleDescriptionDraft} onChange={(event) => setModuleDescriptionDraft(event.target.value)} className={inputClass} />
                        </label>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setModuleEditor(null)} disabled={moduleSaving}>Cancel</Button>
                          <Button type="submit" size="sm" disabled={moduleSaving}>{moduleSaving ? 'Saving…' : 'Add module'}</Button>
                        </div>
                      </form>
                    )}
                    {modulesEditable && !moduleEditingThisCourse && <Button variant="outline" size="sm" onClick={() => openModuleEditor(course.id, null)} disabled={moduleSaving || moduleOrderSavingCourseId === course.id}>Add module</Button>}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="course-editor-title">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 id="course-editor-title" className="text-xl font-bold text-[#1e3a5f]">{editor.mode === 'create' ? 'Create draft course' : 'Edit course'}</h3>
                <p className="mt-1 text-sm text-gray-500">Course status remains draft until content is complete and publication is validated.</p>
              </div>
              <button type="button" className="text-2xl leading-none text-gray-500 hover:text-gray-800" aria-label="Close course editor" onClick={() => { setEditor(null); setSaveError(''); }}>×</button>
            </div>
            <form className="space-y-4" onSubmit={(event) => void saveCourse(event)}>
              {editor.mode === 'create' && <Field label="Slug" htmlFor="course-slug" hint="Lowercase letters and numbers separated by single hyphens."><input id="course-slug" required value={draft.slug} onChange={(event) => updateDraft('slug', event.target.value)} className={inputClass} placeholder="marriage-foundations" /></Field>}
              {editor.mode === 'edit' && <p className="text-sm text-gray-500">Slug: <span className="font-medium text-gray-800">{editor.course.slug}</span></p>}
              <Field label="Title" htmlFor="course-title"><input id="course-title" required maxLength={200} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} className={inputClass} /></Field>
              <Field label="Description" htmlFor="course-description"><textarea id="course-description" rows={3} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} className={inputClass} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category" htmlFor="course-category"><input id="course-category" value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} className={inputClass} /></Field>
                <Field label="Thumbnail URL" htmlFor="course-thumbnail"><input id="course-thumbnail" type="url" value={draft.thumbnailUrl} onChange={(event) => updateDraft('thumbnailUrl', event.target.value)} className={inputClass} placeholder="https://…" /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Audience" htmlFor="course-audience"><select id="course-audience" value={draft.audienceGender} onChange={(event) => updateDraft('audienceGender', event.target.value as CourseAudienceGender)} className={inputClass}><option value="all">Everyone</option><option value="female">Women</option><option value="male">Men</option></select></Field>
                <Field label="Display order" htmlFor="course-order"><input id="course-order" type="number" min="0" step="1" required value={draft.displayOrder} onChange={(event) => updateDraft('displayOrder', event.target.value)} className={inputClass} /></Field>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <h4 className="mb-2 font-semibold text-[#1e3a5f]">Access and price</h4>
                <Field label="Access type" htmlFor="course-access"><select id="course-access" value={draft.isFree ? 'free' : 'paid'} onChange={(event) => updateDraft('isFree', event.target.value === 'free')} className={inputClass}><option value="free">Free</option><option value="paid">Paid</option></select></Field>
                {!draft.isFree && <div className="mt-3"><Field label="Price (UGX)" htmlFor="course-price" hint="Whole UGX units only; pricing is validated by the protected admin RPC."><input id="course-price" type="text" inputMode="numeric" pattern="[0-9]*" required value={draft.price} onChange={(event) => updateDraft('price', event.target.value)} className={inputClass} placeholder="50000" /></Field></div>}
              </div>
              {saveError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{saveError}</p>}
              <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
                <Button type="button" variant="outline" onClick={() => { setEditor(null); setSaveError(''); }} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editor.mode === 'create' ? 'Create draft' : 'Save course'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20';

const Field: React.FC<{ label: string; htmlFor: string; hint?: string; children: React.ReactNode }> = ({ label, htmlFor, hint, children }) => (
  <label className="block text-sm font-medium text-gray-700" htmlFor={htmlFor}>
    {label}
    {children}
    {hint && <span className="mt-1 block text-xs font-normal text-gray-500">{hint}</span>}
  </label>
);
