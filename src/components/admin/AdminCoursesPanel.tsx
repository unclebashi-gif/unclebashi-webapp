import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { updateAdminCourseCommercialTerms } from '@/lib/adminService';
import {
  createAdminCourse,
  getAdminCourses,
  normalizeCourseMetadata,
  updateAdminCourseMetadata,
  updateAdminCourseStatus,
} from '@/lib/adminCourseService';
import type { Course, CourseAudienceGender, CourseStatus } from '@/types/education';

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const [editor, setEditor] = useState<CourseEditor | null>(null);
  const [draft, setDraft] = useState<CourseDraft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setCourses(await getAdminCourses());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load courses.');
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

  const changeStatus = async (course: Course) => {
    const action = statusAction(course);
    if (!action) return;
    setStatusSavingId(course.id);
    setSaveError('');
    setSuccess('');
    try {
      await updateAdminCourseStatus(course, action.status);
      await loadCourses();
      setSuccess(`Course moved to ${action.status}.`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not update course status.');
    } finally {
      setStatusSavingId(null);
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
                  {sandbox && <p className="mt-2 text-xs text-orange-800">Preserved for payment history and kept in draft status.</p>}
                  {course.status === 'draft' && <p className="mt-2 text-xs text-gray-500">Add and validate course content before publishing.</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(course)}>Edit course</Button>
                  {action && <Button variant="outline" size="sm" disabled={statusSavingId === course.id} onClick={() => void changeStatus(course)}>{statusSavingId === course.id ? 'Saving…' : action.label}</Button>}
                  {course.status === 'draft' && <Button variant="outline" size="sm" disabled title="Add and validate course content before publishing">Publish unavailable</Button>}
                </div>
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
