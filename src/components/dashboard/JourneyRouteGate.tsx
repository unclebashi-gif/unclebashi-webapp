import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { activateJourney } from '@/lib/journeyService';
import { journeyCoreEligible, journeyEligibilityMessage } from '@/lib/journeyEligibility';
import { JOURNEY_LABELS } from '@/types/journey';
import type { JourneyType } from '@/types/journey';

interface Props {
  type: 'matchmaking' | 'coaching';
  children: React.ReactNode;
}

export const JourneyRouteGate: React.FC<Props> = ({ type, children }) => {
  const user = useAppStore((state) => state.user);
  const journeys = useAppStore((state) => state.journeys);
  const upsertJourney = useAppStore((state) => state.upsertJourney);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const journey = journeys.find((item) => item.journey_type === type);
  const eligible = journeyCoreEligible(user, type);

  if (type === 'matchmaking' && !eligible) {
    return <GateCard
      title="Marriage Matching is not available from your current Core Profile"
      description={journeyEligibilityMessage(type)}
      action={<Button onClick={() => setCurrentView('profile')}>Update Core Profile</Button>}
    />;
  }

  if (journey?.status === 'active' && eligible) return <>{children}</>;

  if (journey?.status === 'completed') {
    return <GateCard title={`${JOURNEY_LABELS[type]} journey completed`} description="This journey has been completed and cannot be restarted directly. Contact support if you need help." />;
  }

  const actionLabel = journey?.status === 'paused'
    ? `Resume ${JOURNEY_LABELS[type]}`
    : journey?.status === 'withdrawn'
      ? `Restart ${JOURNEY_LABELS[type]}`
      : `Activate ${JOURNEY_LABELS[type]}`;

  const activate = async () => {
    setBusy(true);
    setError('');
    try {
      const makePrimary = !journeys.some((item) => item.is_primary);
      upsertJourney(await activateJourney(type as JourneyType, makePrimary));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not activate this journey.');
    } finally {
      setBusy(false);
    }
  };

  return <GateCard
    title={`${JOURNEY_LABELS[type]} is not active on your account`}
    description={type === 'matchmaking'
      ? 'Activate this journey before setting up your Marriage Matching profile.'
      : 'Activate your Coaching journey to access coaching services.'}
    action={<Button onClick={() => void activate()} disabled={busy} isLoading={busy}>{actionLabel}</Button>}
    error={error}
  />;
};

const GateCard: React.FC<{ title: string; description: string; action?: React.ReactNode; error?: string }> = ({ title, description, action, error }) => (
  <section className="mx-auto my-12 max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
    <h1 className="text-2xl font-bold text-[#1e3a5f]">{title}</h1>
    <p className="mx-auto mt-3 max-w-xl text-gray-600">{description}</p>
    {action && <div className="mt-6">{action}</div>}
    {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
  </section>
);

export default JourneyRouteGate;
