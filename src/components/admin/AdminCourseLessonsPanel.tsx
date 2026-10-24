import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import {
  createAdminCourseLesson,
  getAdminLessonPublicationReadiness,
  getAdminModuleLessons,
  reorderAdminModuleLessons,
  setAdminCourseLessonStatus,
  updateAdminCourseLesson,
} from '@/lib/adminLessonService';
import type { AdminLessonPublicationReadiness, AdminCourseLessonInput } from '@/lib/adminLessonService';
import type { CourseModule, CourseStatus, Lesson, LessonContentType, LessonStatus } from '@/types/education';

interface Props {
  module: CourseModule;
  courseStatus: CourseStatus;
  lessonCount: number | undefined;
  onLessonCountChange?: (count: number) => void;
  onLessonChanged: () => Promise<void>;
}

interface LessonDraft {
  title: string;
  description: string;
  contentType: LessonContentType;
  duration: string;
  mediaUrl: string;
  contentBody: string;
  reflectionPrompts: string[];
}

interface LessonEditor {
  lessonId: string | null;
}

const blankDraft = (): LessonDraft => ({
  title: '',
  description: '',
  contentType: 'video',
  duration: '',
  mediaUrl: '',
  contentBody: '',
  reflectionPrompts: [''],
});

const lessonStatusStyles: Record<LessonStatus, string> = {
  draft: 'bg-amber-100 text-amber-800',
  published: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-gray-100 text-gray-700',
};

const contentTypeLabels: Record<LessonContentType, string> = {
  video: 'Video',
  article: 'Article',
  reflection: 'Reflection',
};

function draftFromLesson(lesson: Lesson): LessonDraft {
  return {
    title: lesson.title,
    description: lesson.description ?? '',
    contentType: lesson.content_type,
    duration: String(lesson.duration_minutes),
    mediaUrl: lesson.media_url ?? '',
    contentBody: lesson.content_body ?? '',
    reflectionPrompts: lesson.reflection_prompts.length > 0 ? lesson.reflection_prompts : [''],
  };
}

export const AdminCourseLessonsPanel: React.FC<Props> = ({
  module,
  courseStatus,
  lessonCount,
  onLessonCountChange,
  onLessonChanged,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [readiness, setReadiness] = useState<Record<string, AdminLessonPublicationReadiness>>({});
  const [readinessErrors, setReadinessErrors] = useState<Record<string, string>>({});
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [editor, setEditor] = useState<LessonEditor | null>(null);
  const [draft, setDraft] = useState<LessonDraft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const loadLessons = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const rows = await getAdminModuleLessons(module.id);
      setLessons(rows);
      onLessonCountChange?.(rows.length);
      setReadinessLoading(true);
      const checks = await Promise.allSettled(rows.map((lesson) =>
        getAdminLessonPublicationReadiness(lesson.id),
      ));
      const nextReadiness: Record<string, AdminLessonPublicationReadiness> = {};
      const nextErrors: Record<string, string> = {};
      checks.forEach((result, index) => {
        const lessonId = rows[index].id;
        if (result.status === 'fulfilled') nextReadiness[lessonId] = result.value;
        else nextErrors[lessonId] = result.reason instanceof Error
          ? result.reason.message
          : 'Could not check lesson readiness.';
      });
      setReadiness(nextReadiness);
      setReadinessErrors(nextErrors);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load lessons.');
    } finally {
      setReadinessLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (expanded) void loadLessons();
    // Load on opening this module; mutation handlers explicitly reload afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, module.id]);

  const openEditor = (lesson: Lesson | null) => {
    if (lesson && (courseStatus !== 'draft' || lesson.status !== 'draft')) return;
    setActionError('');
    setNotice('');
    setDraft(lesson ? draftFromLesson(lesson) : blankDraft());
    setEditor({ lessonId: lesson?.id ?? null });
  };

  const refreshAfterChange = async () => {
    await Promise.all([loadLessons(), onLessonChanged()]);
  };

  const saveLesson = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError('');
    setNotice('');
    const durationMinutes = Number(draft.duration.trim());
    if (!draft.title.trim()) {
      setActionError('Lesson title is required.');
      return;
    }
    if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) {
      setActionError('Duration must be a positive whole number of minutes.');
      return;
    }

    const input: AdminCourseLessonInput = {
      title: draft.title,
      description: draft.description,
      contentType: draft.contentType,
      durationMinutes,
      mediaUrl: draft.contentType === 'video' ? draft.mediaUrl : '',
      contentBody: draft.contentType === 'article' ? draft.contentBody : '',
      reflectionPrompts: draft.contentType === 'reflection'
        ? draft.reflectionPrompts.map((prompt) => prompt.trim()).filter(Boolean)
        : [],
    };

    setSaving(true);
    try {
      if (editor?.lessonId) await updateAdminCourseLesson(editor.lessonId, input);
      else await createAdminCourseLesson(module.id, input);
      setEditor(null);
      await refreshAfterChange();
      setNotice(editor?.lessonId ? 'Lesson updated.' : 'Draft lesson added.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not save the lesson.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (lesson: Lesson, status: LessonStatus) => {
    setActionError('');
    setNotice('');
    setStatusSavingId(lesson.id);
    try {
      await setAdminCourseLessonStatus(lesson.id, status);
      await refreshAfterChange();
      setNotice(`Lesson moved to ${status}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not update lesson status.');
    } finally {
      setStatusSavingId(null);
    }
  };

  const moveLesson = async (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;
    const reordered = [...lessons];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setActionError('');
    setNotice('');
    setReordering(true);
    try {
      await reorderAdminModuleLessons(module.id, reordered.map((lesson) => lesson.id));
      await refreshAfterChange();
      setNotice('Lesson order updated.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not reorder lessons.');
      await loadLessons();
    } finally {
      setReordering(false);
    }
  };

  const updateDraft = <K extends keyof LessonDraft>(key: K, value: LessonDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const parentIsDraft = courseStatus === 'draft';

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-700">
          <span className="font-medium">Lessons</span>
          <span className="ml-2 text-gray-500">{lessonCount ?? '—'}</span>
        </p>
        <Button variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Hide lessons' : 'View / manage lessons'}
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
          {!parentIsDraft && <p className="text-sm text-amber-800">
            {courseStatus === 'published'
              ? 'Return this course to Draft before editing its lessons.'
              : 'Restore this course to Draft before editing its lessons.'}
          </p>}
          {notice && <p className="text-sm text-emerald-700" role="status">{notice}</p>}
          {actionError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{actionError}</p>}
          {loadError && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
            <p>{loadError}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadLessons()}>Retry</Button>
          </div>}
          {loading && <p className="text-sm text-gray-500" role="status">Loading lessons…</p>}
          {readinessLoading && <p className="text-xs text-gray-500" role="status">Checking lesson publication readiness…</p>}
          {!loading && !loadError && lessons.length === 0 && <p className="text-sm text-gray-500">No lessons have been added yet.</p>}

          {!loading && lessons.map((lesson, index) => {
            const lessonReadiness = readiness[lesson.id];
            const editing = editor?.lessonId === lesson.id;
            const busy = saving || reordering || statusSavingId !== null;
            return (
              <article key={lesson.id} className="rounded-lg border border-gray-200 bg-white p-3">
                {editing ? (
                  <LessonForm
                    draft={draft}
                    saving={saving}
                    updateDraft={updateDraft}
                    onSubmit={saveLesson}
                    onCancel={() => setEditor(null)}
                  />
                ) : (
                  <>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-medium text-[#1e3a5f]">{index + 1}. {lesson.title}</h4>
                          <span className="rounded-full bg-sky-100 px-2 py-1 text-xs text-sky-800">{contentTypeLabels[lesson.content_type]}</span>
                          <span className={`rounded-full px-2 py-1 text-xs ${lessonStatusStyles[lesson.status]}`}>{lesson.status}</span>
                          <span className="text-xs text-gray-500">{lesson.duration_minutes} min</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{lesson.description || 'No description.'}</p>
                        {lesson.status === 'draft' && parentIsDraft && (
                          <div className="mt-2 text-xs" aria-live="polite">
                            {readinessErrors[lesson.id]
                              ? <p className="text-red-700">Could not check readiness: {readinessErrors[lesson.id]}</p>
                              : lessonReadiness?.can_publish
                                ? <p className="font-medium text-emerald-700">Ready to publish.</p>
                                : lessonReadiness?.reasons.map((reason) => <p key={reason} className="text-amber-800">{reason}</p>)}
                          </div>
                        )}
                      </div>
                      {parentIsDraft && <div className="flex shrink-0 flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => void moveLesson(index, -1)} disabled={index === 0 || busy}>Move up</Button>
                        <Button variant="outline" size="sm" onClick={() => void moveLesson(index, 1)} disabled={index === lessons.length - 1 || busy}>Move down</Button>
                        <Button variant="outline" size="sm" onClick={() => openEditor(lesson)} disabled={busy || lesson.status !== 'draft'}>Edit</Button>
                        {lesson.status === 'published' && <p className="basis-full text-xs text-gray-600">Return this lesson to Draft before editing its content.</p>}
                        {lesson.status === 'archived' && <p className="basis-full text-xs text-gray-600">Restore this lesson to Draft before editing its content.</p>}
                        {lesson.status === 'draft' && <>
                          <Button variant="outline" size="sm" onClick={() => void changeStatus(lesson, 'published')} disabled={!lessonReadiness?.can_publish || Boolean(readinessErrors[lesson.id]) || busy}>Publish</Button>
                          <Button variant="outline" size="sm" onClick={() => void changeStatus(lesson, 'archived')} disabled={busy}>Archive</Button>
                        </>}
                        {lesson.status === 'published' && <Button variant="outline" size="sm" onClick={() => void changeStatus(lesson, 'draft')} disabled={busy}>Return to Draft</Button>}
                        {lesson.status === 'archived' && <Button variant="outline" size="sm" onClick={() => void changeStatus(lesson, 'draft')} disabled={busy}>Restore to Draft</Button>}
                      </div>}
                    </div>
                  </>
                )}
              </article>
            );
          })}

          {editor?.lessonId === null && (
            <form className="rounded-lg border border-dashed border-gray-300 bg-white p-3" onSubmit={(event) => void saveLesson(event)}>
              <LessonFormFields draft={draft} updateDraft={updateDraft} />
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditor(null)} disabled={saving}>Cancel</Button>
                <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Add draft lesson'}</Button>
              </div>
            </form>
          )}
          {parentIsDraft && !editor && <Button variant="outline" size="sm" onClick={() => openEditor(null)} disabled={busyState(saving, reordering, statusSavingId)}>Add lesson</Button>}
        </div>
      )}
    </div>
  );
};

function busyState(saving: boolean, reordering: boolean, statusSavingId: string | null): boolean {
  return saving || reordering || statusSavingId !== null;
}

const lessonInputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#1e3a5f] focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/20';

const LessonForm: React.FC<{
  draft: LessonDraft;
  saving: boolean;
  updateDraft: <K extends keyof LessonDraft>(key: K, value: LessonDraft[K]) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
}> = ({ draft, saving, updateDraft, onSubmit, onCancel }) => (
  <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
    <LessonFormFields draft={draft} updateDraft={updateDraft} />
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
      <Button type="submit" size="sm" disabled={saving}>{saving ? 'Saving…' : 'Save lesson'}</Button>
    </div>
  </form>
);

const LessonFormFields: React.FC<{
  draft: LessonDraft;
  updateDraft: <K extends keyof LessonDraft>(key: K, value: LessonDraft[K]) => void;
}> = ({ draft, updateDraft }) => (
  <div className="space-y-3">
    <label className="block text-sm font-medium text-gray-700">
      Lesson title
      <input required maxLength={200} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} className={lessonInputClass} />
    </label>
    <label className="block text-sm font-medium text-gray-700">
      Description
      <textarea rows={2} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} className={lessonInputClass} />
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium text-gray-700">
        Content type
        <select value={draft.contentType} onChange={(event) => updateDraft('contentType', event.target.value as LessonContentType)} className={lessonInputClass}>
          <option value="video">Video</option><option value="article">Article</option><option value="reflection">Reflection</option>
        </select>
      </label>
      <label className="block text-sm font-medium text-gray-700">
        Duration (minutes)
        <input type="number" min="1" step="1" required value={draft.duration} onChange={(event) => updateDraft('duration', event.target.value)} className={lessonInputClass} />
      </label>
    </div>
    {draft.contentType === 'video' && <label className="block text-sm font-medium text-gray-700">
      Media URL
      <input type="url" value={draft.mediaUrl} onChange={(event) => updateDraft('mediaUrl', event.target.value)} className={lessonInputClass} placeholder="https://…" />
      <span className="mt-1 block text-xs font-normal text-gray-500">A media URL is required before this lesson can be published.</span>
    </label>}
    {draft.contentType === 'article' && <label className="block text-sm font-medium text-gray-700">
      Article content
      <textarea rows={8} value={draft.contentBody} onChange={(event) => updateDraft('contentBody', event.target.value)} className={lessonInputClass} />
      <span className="mt-1 block text-xs font-normal text-gray-500">Article content is required before this lesson can be published.</span>
    </label>}
    {draft.contentType === 'reflection' && <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-700">Reflection prompts</legend>
      {draft.reflectionPrompts.map((prompt, index) => <div key={index} className="flex gap-2">
        <input aria-label={`Reflection prompt ${index + 1}`} value={prompt} onChange={(event) => {
          const prompts = [...draft.reflectionPrompts];
          prompts[index] = event.target.value;
          updateDraft('reflectionPrompts', prompts);
        }} className={lessonInputClass} placeholder={`Prompt ${index + 1}`} />
        <Button type="button" variant="outline" size="sm" onClick={() => updateDraft('reflectionPrompts', draft.reflectionPrompts.filter((_, promptIndex) => promptIndex !== index))} disabled={draft.reflectionPrompts.length <= 1}>Remove</Button>
      </div>)}
      <Button type="button" variant="outline" size="sm" onClick={() => updateDraft('reflectionPrompts', [...draft.reflectionPrompts, ''])}>Add prompt</Button>
      <p className="text-xs text-gray-500">At least one prompt is required before this lesson can be published.</p>
    </fieldset>}
  </div>
);
