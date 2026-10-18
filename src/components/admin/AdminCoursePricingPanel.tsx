import React, { useCallback, useEffect, useState } from 'react';
import { getAdminCourseCommercialTerms, updateAdminCourseCommercialTerms } from '@/lib/adminService';
import type { AdminCourseCommercialTerms } from '@/types/admin';
import { Button } from '../ui/button';

interface CourseDraft {
  isFree: boolean;
  price: string;
}

const audienceLabels = { all: 'Everyone', female: 'Women', male: 'Men' } as const;

const displayPrice = (course: AdminCourseCommercialTerms): string => {
  if (course.is_free) return 'Free';
  if (course.currency !== 'UGX' || course.price_amount === null || !Number.isSafeInteger(course.price_amount)) {
    return 'Pricing invalid';
  }
  return `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(course.price_amount)}`;
};

export const AdminCoursePricingPanel: React.FC = () => {
  const [courses, setCourses] = useState<AdminCourseCommercialTerms[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CourseDraft>({ isFree: true, price: '' });
  const [saving, setSaving] = useState(false);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setCourses(await getAdminCourseCommercialTerms());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load course pricing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCourses(); }, [loadCourses]);

  const beginEdit = (course: AdminCourseCommercialTerms) => {
    setEditingCourseId(course.course_id);
    setDraft({ isFree: course.is_free, price: course.price_amount?.toString() ?? '' });
    setSaveError('');
    setSuccess('');
  };

  const save = async (course: AdminCourseCommercialTerms) => {
    setSaveError('');
    setSuccess('');
    let amount: number | null = null;
    if (!draft.isFree) {
      if (!/^\d+$/.test(draft.price.trim())) {
        setSaveError('Enter a positive whole-number price in UGX.');
        return;
      }
      amount = Number(draft.price.trim());
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        setSaveError('Enter a positive whole-number price in UGX.');
        return;
      }
    }

    setSaving(true);
    try {
      await updateAdminCourseCommercialTerms({
        courseId: course.course_id,
        isFree: draft.isFree,
        priceAmount: amount,
      });
      setSuccess('Course commercial terms saved.');
      setEditingCourseId(null);
      await loadCourses();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save course commercial terms.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-[#1e3a5f]">Courses &amp; pricing</h2>
          <p className="text-sm text-gray-500 mt-1">Set free or paid access and whole-unit UGX pricing. Course content remains managed in the CMS.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadCourses()} disabled={loading}>Refresh</Button>
      </div>

      {success && <p className="mb-4 text-sm text-emerald-700" role="status">{success}</p>}
      {loadError && <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-800" role="alert"><p>{loadError}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void loadCourses()}>Retry</Button></div>}
      {saveError && <p className="mb-4 text-sm text-red-700" role="alert">{saveError}</p>}
      {loading && <p className="text-sm text-gray-500" role="status">Loading course terms…</p>}
      {!loading && !loadError && courses.length === 0 && <p className="text-gray-500">No courses are available to manage yet.</p>}

      <div className="space-y-3">
        {courses.map((course) => {
          const isEditing = editingCourseId === course.course_id;
          return (
            <article key={course.course_id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold text-[#1e3a5f]">{course.title}</h3>
                  <p className="text-sm text-gray-500">{course.slug} · {course.status}</p>
                  <p className="mt-2 text-sm text-gray-600">Audience: {audienceLabels[course.audience_gender]}</p>
                  <p className="text-sm font-medium text-gray-800">{displayPrice(course)}</p>
                </div>
                {!isEditing && <Button variant="outline" size="sm" onClick={() => beginEdit(course)}>Edit terms</Button>}
              </div>
              {isEditing && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <label className="block text-sm font-medium text-gray-700" htmlFor={`course-access-${course.course_id}`}>Access type</label>
                  <select id={`course-access-${course.course_id}`} value={draft.isFree ? 'free' : 'paid'}
                    onChange={(event) => setDraft((current) => ({ ...current, isFree: event.target.value === 'free' }))}
                    disabled={saving} className="mt-1 w-full max-w-sm rounded-lg border border-gray-300 px-3 py-2">
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                  </select>
                  {!draft.isFree && (
                    <div className="mt-3 max-w-sm">
                      <label className="block text-sm font-medium text-gray-700" htmlFor={`course-price-${course.course_id}`}>Price (UGX)</label>
                      <input id={`course-price-${course.course_id}`} type="text" inputMode="numeric" pattern="[0-9]*"
                        value={draft.price} onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
                        disabled={saving} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="Whole UGX amount" />
                      <p className="mt-1 text-xs text-gray-500">Whole UGX units only. Currency is fixed for the Uganda launch.</p>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => void save(course)} disabled={saving}>{saving ? 'Saving…' : 'Save terms'}</Button>
                    <Button variant="outline" onClick={() => { setEditingCourseId(null); setSaveError(''); }} disabled={saving}>Cancel</Button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
