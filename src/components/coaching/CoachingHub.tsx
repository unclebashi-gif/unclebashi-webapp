import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { Button } from '../ui/button';
import { cancelCoachingBooking, decideCoachingBooking, getListedCoaches, getMyCoachingBookings, requestCoachingSession, completeCoachingBooking } from '@/lib/coachingService';
import type { CoachingBooking, ListedCoach } from '@/types/coaching';
import { COUNTRY_NAMES } from '@/hooks/useGeolocation';
import { SparklesIcon, BookIcon, CalendarIcon, UserIcon, AlertCircleIcon, ClockIcon, MapPinIcon } from '../ui/Icons';

type Tab = 'journal' | 'coaches' | 'sessions';
export const CoachingHub: React.FC = () => {
  const { user, journalEntries, addJournalEntry } = useAppStore();
  const [tab, setTab] = useState<Tab>('journal');
  const [coaches, setCoaches] = useState<ListedCoach[]>([]);
  const [bookings, setBookings] = useState<CoachingBooking[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [country, setCountry] = useState('');
  const [coach, setCoach] = useState<ListedCoach | null>(null);
  const [showBooking, setShowBooking] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [savingBooking, setSavingBooking] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [reflection, setReflection] = useState('');
  const [aiError, setAiError] = useState('');
  const [promptLoading, setPromptLoading] = useState(false);
  const [reflectionLoading, setReflectionLoading] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const isCoach = user?.roles.includes('coach') ?? false;
  const isAdmin = user?.roles.includes('admin') ?? false;

  const loadCoaches = useCallback(async () => {
    setLoadingCoaches(true); setError('');
    try { setCoaches(await getListedCoaches()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load coaches.'); }
    finally { setLoadingCoaches(false); }
  }, []);
  const loadBookings = useCallback(async () => {
    setLoadingBookings(true); setError('');
    try { setBookings(await getMyCoachingBookings()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load sessions.'); }
    finally { setLoadingBookings(false); }
  }, []);
  useEffect(() => { void loadCoaches(); void loadBookings(); }, [loadCoaches, loadBookings]);
  const visibleCoaches = useMemo(() => country ? coaches.filter((x) => x.country_code === country) : coaches, [coaches, country]);

  const getPrompt = async () => {
    setPromptLoading(true); setAiError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-coaching', { body: { type: 'daily_prompt' } });
      if (invokeError) throw invokeError;
      if (typeof data?.response !== 'string' || !data.response.trim()) throw new Error('No response');
      setPrompt(data.response);
    } catch { setAiError('AI prompts are temporarily unavailable. You can still write a reflection.'); }
    finally { setPromptLoading(false); }
  };
  const getReflection = async () => {
    if (!response.trim()) return;
    setReflectionLoading(true); setAiError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-coaching', { body: { type: 'journal_reflection', journalEntry: response } });
      if (invokeError) throw invokeError;
      if (typeof data?.response !== 'string' || !data.response.trim()) throw new Error('No response');
      setReflection(data.response);
    } catch { setAiError('AI insight is temporarily unavailable.'); }
    finally { setReflectionLoading(false); }
  };
  const saveJournal = () => {
    if (!response.trim()) return;
    addJournalEntry({ id: Date.now().toString(), prompt, response, aiReflection: reflection, createdAt: new Date().toISOString() });
    setPrompt(''); setResponse(''); setReflection('');
  };
  const submitBooking = async () => {
    if (!coach || !date || !time || savingBooking) return;
    const start = new Date(date + 'T' + time + ':00');
    if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) { setNotice('Choose a future date and time.'); return; }
    setSavingBooking(true); setNotice('');
    try {
      await requestCoachingSession({ coachId: coach.id, requestedStartAt: start.toISOString(), requestedTimezone: timezone, clientNote: note });
      setShowBooking(false); setDate(''); setTime(''); setNote('');
      setNotice('Your request was sent. The requested time is pending until the coach confirms.');
      await loadBookings(); setTab('sessions');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not send the booking request.'); }
    finally { setSavingBooking(false); }
  };
  const bookingAction = async (item: CoachingBooking, action: 'cancel' | 'confirm' | 'decline' | 'complete') => {
    setBusyId(item.id); setNotice('');
    try {
      if (action === 'cancel') await cancelCoachingBooking(item.id);
      else if (action === 'complete') await completeCoachingBooking(item.id);
      else await decideCoachingBooking(item.id, action === 'confirm' ? 'confirmed' : 'declined');
      await loadBookings();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not update booking.'); }
    finally { setBusyId(''); }
  };
  const place = (item: ListedCoach) => [item.city, item.country_code ? COUNTRY_NAMES[item.country_code] || item.country_code : ''].filter(Boolean).join(', ') || 'Location not provided';

  return <div className="min-h-screen bg-[#faf6f1] py-8"><div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
    <header className="mb-8"><h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">Coaching &amp; Guidance</h1><p className="text-gray-600">AI-guided reflection and access to human coaches across East Africa and the Diaspora.</p></header>
    <div className="flex space-x-1 bg-white rounded-xl p-1 mb-8 shadow-sm">{[
      ['journal','AI Journaling',SparklesIcon],['coaches','Our Coaches',UserIcon],['sessions',isCoach || isAdmin ? 'Bookings' : 'My Sessions',CalendarIcon],
    ].map(([id,label,Icon]) => <button key={String(id)} onClick={() => setTab(id as Tab)} className={'flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg font-medium ' + (tab === id ? 'bg-[#1e3a5f] text-white' : 'text-gray-600 hover:bg-gray-50')}><Icon size={18}/><span className="hidden sm:inline">{String(label)}</span></button>)}</div>
    {notice && <p role="status" className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{notice}</p>}
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error} <button className="underline" onClick={() => { void loadCoaches(); void loadBookings(); }}>Retry</button></p>}

    {tab === 'journal' && <div className="grid lg:grid-cols-3 gap-8"><section className="lg:col-span-2 bg-white rounded-2xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-6"><h2 className="text-xl font-bold text-[#1e3a5f]">Today's Reflection</h2><Button variant="outline" size="sm" isLoading={promptLoading} onClick={() => void getPrompt()}><SparklesIcon size={16} className="mr-2"/>Get Prompt</Button></div>
      {aiError && <p role="alert" className="text-sm text-amber-800 bg-amber-50 p-3 rounded-lg mb-4">{aiError}</p>}
      {prompt && <div className="bg-[#faf6f1] rounded-xl p-4 mb-6"><p className="text-sm font-medium text-[#c4785a] mb-2">Today's Prompt</p><p className="text-[#1e3a5f] italic">"{prompt}"</p></div>}
      <textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Write your thoughts here... Take your time to reflect deeply." rows={8} className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none mb-4"/>
      {reflection && <div className="bg-blue-50 rounded-xl p-4 mb-4"><p className="text-sm font-medium text-blue-800 mb-2">AI Reflection</p><p className="text-blue-700 text-sm">{reflection}</p></div>}
      <div className="flex justify-between"><Button variant="outline" disabled={!response.trim()} isLoading={reflectionLoading} onClick={() => void getReflection()}><SparklesIcon size={16} className="mr-2"/>Get AI Insight</Button><Button disabled={!response.trim()} onClick={saveJournal}>Save Entry</Button></div>
      <div className="mt-6 p-4 bg-amber-50 rounded-xl flex gap-3"><AlertCircleIcon size={20} className="text-amber-600"/><div><p className="text-sm font-medium text-amber-800">Need to talk to someone?</p><p className="text-sm text-amber-700">For immediate support, please reach out to a human coach.</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => setTab('coaches')}>Connect with a Coach →</Button></div></div>
    </section><aside className="bg-white rounded-2xl shadow-sm p-6"><h3 className="font-semibold text-[#1e3a5f] mb-4">Past Entries</h3>{journalEntries.length ? journalEntries.slice(0,5).map((entry) => <div key={entry.id} className="p-3 bg-[#faf6f1] rounded-lg mb-3"><p className="text-xs text-gray-500">{new Date(entry.createdAt).toLocaleDateString()}</p><p className="text-sm text-[#1e3a5f] line-clamp-2">{entry.response}</p></div>) : <div className="text-center py-8"><BookIcon size={32} className="text-gray-300 mx-auto mb-3"/><p className="text-gray-500 text-sm">No entries yet</p><p className="text-gray-400 text-xs">Entries are stored on this device.</p></div>}</aside></div>}

    {tab === 'coaches' && <section><div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-col sm:flex-row justify-between gap-4"><p className="text-sm text-gray-600">Choose a coach and request a date and time. Requested times are not guaranteed.</p><select aria-label="Filter by country" value={country} onChange={(e) => setCountry(e.target.value)} className="px-3 py-2 border rounded-lg text-sm"><option value="">All Locations</option>{Object.entries(COUNTRY_NAMES).map(([code,name]) => <option key={code} value={code}>{name}</option>)}</select></div>
      {loadingCoaches ? <p role="status" className="text-center py-12 text-gray-500">Loading coaches…</p> : visibleCoaches.length === 0 ? <div className="bg-white rounded-2xl p-12 text-center"><UserIcon size={48} className="text-gray-300 mx-auto mb-4"/><h3 className="text-lg font-medium text-gray-600 mb-2">{country ? 'No coaches in this location' : 'Our coaching team is being prepared'}</h3><p className="text-gray-500">Please check back soon.</p></div> : <div className="grid md:grid-cols-2 gap-6">{visibleCoaches.map((item) => <article key={item.id} className="bg-white rounded-2xl shadow-sm p-6"><div className="flex gap-4">{item.profile_image_url ? <img src={item.profile_image_url} alt="" className="w-20 h-20 rounded-xl object-cover"/> : <div className="w-20 h-20 rounded-xl bg-[#faf6f1] flex items-center justify-center"><UserIcon size={28}/></div>}<div><h3 className="text-lg font-semibold text-[#1e3a5f]">{item.display_name}</h3>{item.title && <p className="text-[#c4785a] text-sm">{item.title}</p>}<p className="flex items-center mt-2 text-sm text-gray-500"><MapPinIcon size={14} className="mr-1"/>{place(item)}</p></div></div>{item.bio && <p className="text-sm text-gray-600 mt-4">{item.bio}</p>}{item.specialties.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{item.specialties.map((x) => <span key={x} className="px-2 py-1 bg-[#faf6f1] rounded text-xs">{x}</span>)}</div>}{item.languages.length > 0 && <p className="text-sm text-gray-600 mt-4">Languages: {item.languages.join(', ')}</p>}<div className="mt-5 flex items-center justify-between"><span className="text-sm text-gray-500 flex items-center"><ClockIcon size={14} className="mr-1"/>{item.default_session_minutes} minutes</span><Button size="sm" onClick={() => { setCoach(item); setShowBooking(true); setNotice(''); }}>Request Session</Button></div></article>)}</div>}</section>}

    {tab === 'sessions' && <section className="bg-white rounded-2xl shadow-sm p-6"><div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-[#1e3a5f]">{isCoach || isAdmin ? 'Coaching Bookings' : 'My Sessions'}</h2><Button variant="outline" size="sm" isLoading={loadingBookings} onClick={() => void loadBookings()}>Refresh</Button></div>
      {loadingBookings ? <p role="status" className="text-center py-10 text-gray-500">Loading sessions…</p> : bookings.length === 0 ? <div className="text-center py-12"><CalendarIcon size={48} className="text-gray-300 mx-auto mb-4"/><h3 className="text-lg font-medium text-gray-600 mb-2">No sessions yet</h3><p className="text-gray-500 mb-4">Requests and confirmed sessions will appear here.</p>{!isCoach && !isAdmin && <Button onClick={() => setTab('coaches')}>Browse Coaches</Button>}</div> : <div className="space-y-4">{bookings.map((item) => {
        const clientOwns = item.is_client_booking;
        const staff = isAdmin || (isCoach && !clientOwns);
        const canClientCancel = clientOwns && ['pending','confirmed'].includes(item.status) && new Date(item.requested_start_at).getTime() > Date.now();
        return <article key={item.id} className="border rounded-xl p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold text-[#1e3a5f]">{staff ? item.client_display_name : item.coach_display_name}</p><p className="text-sm text-gray-600">{new Date(item.requested_start_at).toLocaleString(undefined,{timeZone:item.requested_timezone})} ({item.requested_timezone}) · {item.duration_minutes} minutes</p>{item.client_note && <p className="text-sm text-gray-500 mt-2">{item.client_note}</p>}</div><span className="capitalize text-sm">{item.status}</span></div><div className="flex flex-wrap gap-2 mt-4">
          {canClientCancel && <Button size="sm" variant="outline" disabled={busyId===item.id} onClick={() => void bookingAction(item,'cancel')}>Cancel</Button>}
          {staff && item.status==='pending' && <><Button size="sm" disabled={busyId===item.id} onClick={() => void bookingAction(item,'confirm')}>Confirm</Button><Button size="sm" variant="outline" disabled={busyId===item.id} onClick={() => void bookingAction(item,'decline')}>Decline</Button></>}
          {staff && ['pending','confirmed'].includes(item.status) && <Button size="sm" variant="outline" disabled={busyId===item.id} onClick={() => void bookingAction(item,'cancel')}>Cancel</Button>}
          {staff && item.status==='confirmed' && new Date(item.requested_start_at).getTime()<=Date.now() && <Button size="sm" disabled={busyId===item.id} onClick={() => void bookingAction(item,'complete')}>Mark completed</Button>}
        </div></article>;
      })}</div>}</section>}

    {showBooking && coach && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><button aria-label="Close dialog" className="fixed inset-0 bg-black/50" onClick={() => setShowBooking(false)}/><div role="dialog" aria-modal="true" aria-labelledby="booking-heading" className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6"><h3 id="booking-heading" className="text-xl font-bold text-[#1e3a5f] mb-2">Request a session with {coach.display_name}</h3><p className="text-gray-600 mb-4">{coach.default_session_minutes} minutes. Timezone: {timezone}. Your requested time is pending until the coach confirms.</p><label className="block text-sm mb-3">Date<input type="date" min={new Date().toISOString().slice(0,10)} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border rounded-lg p-2"/></label><label className="block text-sm mb-3">Time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full border rounded-lg p-2"/></label><label className="block text-sm mb-5">Note (optional)<textarea maxLength={3000} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full border rounded-lg p-2"/></label><div className="flex gap-3"><Button variant="outline" fullWidth disabled={savingBooking} onClick={() => setShowBooking(false)}>Close</Button><Button fullWidth isLoading={savingBooking} disabled={!date || !time || savingBooking} onClick={() => void submitBooking()}>Send Request</Button></div></div></div>}
  </div></div>;
};
