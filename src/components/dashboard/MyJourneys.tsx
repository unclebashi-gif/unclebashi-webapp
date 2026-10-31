import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { activateJourney, getMyJourneys, setJourneyStatus } from '@/lib/journeyService';
import { journeyCoreEligible, journeyEligibilityMessage } from '@/lib/journeyEligibility';
import { JOURNEY_DESTINATIONS, JOURNEY_LABELS, JOURNEY_TYPES } from '@/types/journey';
import type { JourneyStatus, JourneyType } from '@/types/journey';

const journeyDescriptions: Record<JourneyType, string> = {
  marriage_education: 'Learn about relationships, marriage and family life.',
  marriage_preparation: 'Prepare thoughtfully for a future marriage.',
  matchmaking: 'Build a profile and explore intentional introductions.',
  marriage_support: 'Support resources will appear here as they are enabled.',
  coaching: 'Access practical guidance and coaching support.',
  counselling: 'Visit the counselling information and support page.',
};

const statusLabel: Record<JourneyStatus, string> = {
  active: 'Active', paused: 'Paused', completed: 'Completed', withdrawn: 'Withdrawn',
};

export const MyJourneys: React.FC = () => {
  const user = useAppStore((state) => state.user);
  const journeys = useAppStore((state) => state.journeys);
  const setJourneys = useAppStore((state) => state.setJourneys);
  const upsertJourney = useAppStore((state) => state.upsertJourney);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<JourneyType | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setJourneys(await getMyJourneys());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your journeys.');
    } finally {
      setLoading(false);
    }
  }, [setJourneys]);

  useEffect(() => { void refresh(); }, [refresh]);

  const activate = async (type: JourneyType, makePrimary = !journeys.some((journey) => journey.is_primary)) => {
    if (!journeyCoreEligible(user, type)) {
      setError(journeyEligibilityMessage(type));
      return;
    }
    setBusyType(type);
    setError('');
    try {
      upsertJourney(await activateJourney(type, makePrimary));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not activate this journey.');
    } finally {
      setBusyType(null);
    }
  };

  const changeStatus = async (type: JourneyType, status: Exclude<JourneyStatus, 'active'>) => {
    setBusyType(type);
    setError('');
    try {
      upsertJourney(await setJourneyStatus(type, status));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this journey.');
    } finally {
      setBusyType(null);
    }
  };

  return <section className="mb-8 rounded-2xl bg-white p-6 shadow-sm" aria-labelledby="my-journeys-heading">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h2 id="my-journeys-heading" className="text-xl font-bold text-[#1e3a5f]">My Journeys</h2><p className="mt-1 text-sm text-gray-600">Choose the services you want to use. Your primary journey is shown on your account.</p></div>
      {loading && <span className="text-sm text-gray-500" role="status">Loading journeys…</span>}
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {JOURNEY_TYPES.map((type) => {
        const journey = journeys.find((item) => item.journey_type === type);
        const busy = busyType === type;
        const destination = JOURNEY_DESTINATIONS[type];
        const eligible = journeyCoreEligible(user, type);
        return <article key={type} className="rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold text-[#1e3a5f]">{JOURNEY_LABELS[type]}</h3>{journey && <div className="flex gap-2 text-xs"><span className="rounded-full bg-gray-100 px-2 py-1">{statusLabel[journey.status]}</span>{journey.is_primary && <span className="rounded-full bg-[#faf6f1] px-2 py-1 text-[#8d533b]">Primary</span>}</div>}</div>
          <p className="mt-2 min-h-10 text-sm text-gray-600">{journeyDescriptions[type]}</p>
          {type === 'matchmaking' && !eligible && <p className="mt-2 text-xs text-gray-600">{journeyEligibilityMessage(type)}</p>}
          {type === 'marriage_support' && !eligible && <p className="mt-2 text-xs text-gray-600">{journeyEligibilityMessage(type)}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {!journey && <Button size="sm" disabled={!eligible || busy} isLoading={busy} onClick={() => void activate(type)}>Start</Button>}
            {journey?.status === 'active' && destination && <Button size="sm" onClick={() => setCurrentView(destination)}>Open</Button>}
            {journey?.status === 'active' && type === 'marriage_support' && <span className="self-center text-xs text-gray-500">Resources will appear here as enabled.</span>}
            {journey?.status === 'active' && <Button size="sm" variant="outline" disabled={busy} onClick={() => void changeStatus(type, 'paused')}>Pause</Button>}
            {journey?.status === 'active' && !journey.is_primary && <Button size="sm" variant="outline" disabled={busy} onClick={() => void activate(type, true)}>Make Primary</Button>}
            {journey?.status === 'paused' && <Button size="sm" disabled={!eligible || busy} isLoading={busy} onClick={() => void activate(type)}>Resume</Button>}
            {journey?.status === 'withdrawn' && <Button size="sm" disabled={!eligible || busy} isLoading={busy} onClick={() => void activate(type)}>Restart</Button>}
            {journey?.status === 'completed' && <span className="self-center text-sm text-gray-500">This journey is complete.</span>}
          </div>
        </article>;
      })}
    </div>
    {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}<button type="button" className="ml-2 underline" onClick={() => void refresh()}>Refresh</button></p>}
  </section>;
};

export default MyJourneys;
