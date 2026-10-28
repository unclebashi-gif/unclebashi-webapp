import React from 'react';
import { Link } from 'react-router-dom';

const pathway = [
  { title: 'Central intake', description: 'A clear first step to understand what kind of support may be helpful.' },
  { title: 'Assessment, stabilisation and triage', description: 'A careful assessment would help identify needs and the appropriate next step.' },
  { title: 'A suitable partner psychotherapist', description: 'Where appropriate, the planned pathway would connect a person or couple with a partner psychotherapist suited to their needs.' },
];

const futureSpecialties = [
  'Couples & Marriage',
  'Family Therapy',
  'Relationship Therapy',
  'Crisis Intervention',
  'Trauma',
  'Grief & Loss',
  'Individual Emotional Distress',
];

export const CounsellingPage: React.FC = () => (
  <main className="bg-white">
    <section className="bg-[#faf6f1] py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#c4785a]">Counselling</p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight text-[#1e3a5f] sm:text-5xl">A thoughtful path to relationship and emotional support</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-gray-600">
          Uncle Bashi is developing a guided counselling pathway. The intended model begins with a central intake and assessment, followed by stabilisation and triage, then an appropriate referral to a partner psychotherapist when available.
        </p>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-gray-600">This service is in development and is not currently accepting counselling bookings. This page does not provide emergency support.</p>
        <Link to="/contact" className="mt-8 inline-flex rounded-lg bg-[#1e3a5f] px-5 py-3 font-medium text-white transition hover:bg-[#294b73]">Contact Uncle Bashi</Link>
      </div>
    </section>

    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <h2 className="text-2xl font-semibold text-[#1e3a5f]">Our planned pathway</h2>
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {pathway.map((step, index) => (
          <article key={step.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <span className="text-sm font-semibold text-[#c4785a]">STEP {index + 1}</span>
            <h3 className="mt-3 text-lg font-semibold text-[#1e3a5f]">{step.title}</h3>
            <p className="mt-3 text-sm leading-6 text-gray-600">{step.description}</p>
          </article>
        ))}
      </div>
    </section>

    <section className="bg-[#faf6f1] py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-semibold text-[#1e3a5f]">Areas the service may support</h2>
        <p className="mt-3 max-w-2xl text-gray-600">These are planned areas of focus; availability will depend on the service and partner network as it develops.</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {futureSpecialties.map((specialty) => (
            <li key={specialty} className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-[#1e3a5f] shadow-sm">{specialty}</li>
          ))}
        </ul>
      </div>
    </section>
  </main>
);

export default CounsellingPage;
