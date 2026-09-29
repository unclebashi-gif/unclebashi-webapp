import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cancelCoachingBooking, completeCoachingBooking, createCoachProfile, decideCoachingBooking, getAdminCoaches, getCoachRoleCandidates, getMyCoachingBookings, updateCoachProfile } from '@/lib/coachingService';
import type { AdminCoach, CoachingBooking, CoachRoleCandidate, NewCoachProfile } from '@/types/coaching';

const blank = {
  display_name: '', title: '', bio: '', profile_image_url: '', specialties: '', languages: '',
  country_code: '', city: '', default_session_minutes: '45', is_active: true, is_listed: true,
};

export const AdminCoachingPanel: React.FC = () => {
  const [coaches, setCoaches] = useState<AdminCoach[]>([]);
  const [candidates, setCandidates] = useState<CoachRoleCandidate[]>([]);
  const [bookings, setBookings] = useState<CoachingBooking[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [coachRows, candidateRows, bookingRows] = await Promise.all([getAdminCoaches(), getCoachRoleCandidates(), getMyCoachingBookings()]);
      setCoaches(coachRows); setCandidates(candidateRows); setBookings(bookingRows);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load coaching management data.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const selectCoach = (id: string) => {
    setSelectedId(id);
    const coach = coaches.find((item) => item.id === id);
    if (!coach) { setForm(blank); return; }
    setForm({
      display_name: coach.display_name, title: coach.title || '', bio: coach.bio || '',
      profile_image_url: coach.profile_image_url || '', specialties: coach.specialties.join(', '),
      languages: coach.languages.join(', '), country_code: coach.country_code || '', city: coach.city || '',
      default_session_minutes: String(coach.default_session_minutes), is_active: coach.is_active, is_listed: coach.is_listed,
    });
  };
  const saveCoach = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setSuccess('');
    const common = {
      display_name: form.display_name.trim(), title: form.title.trim() || null, bio: form.bio.trim() || null,
      profile_image_url: form.profile_image_url.trim() || null,
      specialties: form.specialties.split(',').map((x) => x.trim()).filter(Boolean),
      languages: form.languages.split(',').map((x) => x.trim()).filter(Boolean),
      country_code: form.country_code.trim().toUpperCase() || null, city: form.city.trim() || null,
      default_session_minutes: Number(form.default_session_minutes),
    };
    try {
      if (selectedId) {
        const current = coaches.find((x) => x.id === selectedId);
        if (!current) throw new Error('Select a coach profile.');
        await updateCoachProfile({ ...current, ...common, is_active: form.is_active, is_listed: form.is_listed });
        setSuccess('Coach profile updated.');
      } else {
        if (!candidateId) throw new Error('Choose an eligible coach account.');
        await createCoachProfile({ ...common, user_id: candidateId } as NewCoachProfile);
        setSuccess('Coach profile created.'); setCandidateId('');
      }
      setSelectedId('');
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save coach profile.'); }
    finally { setSaving(false); }
  };
  const bookingAction = async (booking: CoachingBooking, action: 'confirmed' | 'declined' | 'cancel' | 'complete') => {
    setError(''); setSuccess('');
    try {
      if (action === 'cancel') await cancelCoachingBooking(booking.id);
      else if (action === 'complete') await completeCoachingBooking(booking.id);
      else await decideCoachingBooking(booking.id, action);
      setSuccess('Booking updated.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update booking.'); }
  };

  if (loading) return <p role="status" className="rounded-xl bg-white p-6 text-gray-600">Loading coaching management…</p>;
  return <div className="space-y-8">
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {success && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{success}</p>}
    <section className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-5"><h2 className="text-lg font-bold text-[#1e3a5f]">Coach profiles</h2><Button variant="outline" size="sm" onClick={() => void refresh()}>Refresh</Button></div>
      {coaches.length === 0 && <p className="text-sm text-gray-500 mb-4">No coach profiles have been created.</p>}
      <div className="grid md:grid-cols-2 gap-6">
        <form onSubmit={(e) => void saveCoach(e)} className="space-y-3">
          <label className="block text-sm">Existing profile<select value={selectedId} onChange={(e) => selectCoach(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"><option value="">Create profile…</option>{coaches.map((x) => <option key={x.id} value={x.id}>{x.display_name}</option>)}</select></label>
          {!selectedId && <label className="block text-sm">Eligible coach account<select required value={candidateId} onChange={(e) => setCandidateId(e.target.value)} className="block w-full border rounded-lg p-2 mt-1"><option value="">Select coach-role user</option>{candidates.map((x) => <option key={x.user_id} value={x.user_id}>{x.full_name}</option>)}</select></label>}
          <label className="block text-sm">Display name<input required maxLength={120} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="block w-full border rounded-lg p-2 mt-1"/></label>
          <label className="block text-sm">Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="block w-full border rounded-lg p-2 mt-1"/></label>
          <label className="block text-sm">Bio<textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} className="block w-full border rounded-lg p-2 mt-1"/></label>
          <label className="block text-sm">Profile image URL<input value={form.profile_image_url} onChange={(e) => setForm({ ...form, profile_image_url: e.target.value })} className="block w-full border rounded-lg p-2 mt-1"/></label>
          <label className="block text-sm">Specialties, comma separated<input value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} className="block w-full border rounded-lg p-2 mt-1"/></label>
          <label className="block text-sm">Languages, comma separated<input value={form.languages} onChange={(e) => setForm({ ...form, languages: e.target.value })} className="block w-full border rounded-lg p-2 mt-1"/></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm">Country code<input maxLength={2} value={form.country_code} onChange={(e) => setForm({ ...form, country_code: e.target.value })} className="block w-full border rounded-lg p-2 mt-1"/></label><label className="text-sm">City<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="block w-full border rounded-lg p-2 mt-1"/></label></div>
          <label className="block text-sm">Default session length (minutes)<input type="number" min={1} max={480} value={form.default_session_minutes} onChange={(e) => setForm({ ...form, default_session_minutes: e.target.value })} className="block w-full border rounded-lg p-2 mt-1"/></label>
          {selectedId && <div className="flex gap-4 text-sm"><label><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}/> Active</label><label><input type="checkbox" checked={form.is_listed} onChange={(e) => setForm({ ...form, is_listed: e.target.checked })}/> Listed</label></div>}
          <div className="flex gap-2"><Button type="submit" isLoading={saving}>{selectedId ? 'Save profile' : 'Create profile'}</Button>{selectedId && <Button type="button" variant="outline" onClick={() => selectCoach('')}>New profile</Button>}</div>
        </form>
        <div><h3 className="font-semibold text-[#1e3a5f] mb-3">Current profiles</h3>{coaches.length ? <div className="space-y-2">{coaches.map((x) => <button key={x.id} onClick={() => selectCoach(x.id)} className="w-full rounded-lg border p-3 text-left"><span className="font-medium">{x.display_name}</span><span className="ml-2 text-sm text-gray-500">{x.is_active && x.is_listed ? 'Listed' : 'Not listed'}</span></button>)}</div> : <p className="text-sm text-gray-500">Eligible coach-role accounts: {candidates.length}</p>}</div>
      </div>
    </section>
    <section className="bg-white rounded-xl shadow-sm p-6"><div className="flex justify-between items-center mb-5"><h2 className="text-lg font-bold text-[#1e3a5f]">Bookings</h2><Button variant="outline" size="sm" onClick={() => void refresh()}>Refresh</Button></div>
      {bookings.length===0 ? <p className="text-sm text-gray-500">No coaching bookings.</p> : <div className="space-y-3">{bookings.map((b) => <article key={b.id} className="border rounded-lg p-4"><div className="flex justify-between gap-3"><div><p className="font-medium">{b.client_display_name || 'Member'} · {b.coach_display_name}</p><p className="text-sm text-gray-600">{new Date(b.requested_start_at).toLocaleString(undefined,{timeZone:b.requested_timezone})} ({b.requested_timezone}) · {b.duration_minutes} min</p>{b.client_note && <p className="text-sm text-gray-500 mt-1">{b.client_note}</p>}</div><span className="capitalize text-sm">{b.status}</span></div><div className="flex gap-2 mt-3">{b.status==='pending' && <><Button size="sm" onClick={() => void bookingAction(b,'confirmed')}>Confirm</Button><Button size="sm" variant="outline" onClick={() => void bookingAction(b,'declined')}>Decline</Button></>}{['pending','confirmed'].includes(b.status) && <Button size="sm" variant="outline" onClick={() => void bookingAction(b,'cancel')}>Cancel</Button>}{b.status==='confirmed' && new Date(b.requested_start_at).getTime()<=Date.now() && <Button size="sm" onClick={() => void bookingAction(b,'complete')}>Complete</Button>}</div></article>)}</div>}
    </section>
  </div>;
};

