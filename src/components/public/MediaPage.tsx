import React from 'react';

const mediaTypes = [
  { title: 'Articles', description: 'Practical reflections and guidance for intentional relationships.' },
  { title: 'Social excerpts', description: 'Short ideas and conversations from the Uncle Bashi community.' },
  { title: 'Videos', description: 'Watch and learn at your own pace.' },
  { title: 'Marriage lessons', description: 'Learning resources for preparation and growth.' },
  { title: 'Case reflections', description: 'Thoughtful, privacy-conscious perspectives on common relationship themes.' },
  { title: 'Counsellor insights', description: 'Perspectives from qualified professionals as this resource library develops.' },
];

export const MediaPage: React.FC = () => (
  <main className="bg-white">
    <section className="bg-[#faf6f1] py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#c4785a]">Media</p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight text-[#1e3a5f] sm:text-5xl">Ideas and stories for building stronger relationships</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-gray-600">A home for practical learning, thoughtful stories and professional perspectives. We are preparing this resource library; no articles or videos are published here yet.</p>
      </div>
    </section>
    <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {mediaTypes.map((item) => (
          <article key={item.title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[#1e3a5f]">{item.title}</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">{item.description}</p>
          </article>
        ))}
      </div>
      <p className="mt-10 rounded-xl bg-[#faf6f1] p-5 text-sm text-gray-600" role="status">New resources are being prepared. Please check back later.</p>
    </section>
  </main>
);

export default MediaPage;
