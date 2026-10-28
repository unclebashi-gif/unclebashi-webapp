import React from 'react';

export const ContactPage: React.FC = () => (
  <main className="bg-white">
    <section className="min-h-[55vh] bg-[#faf6f1] py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#c4785a]">Contact</p>
        <h1 className="text-4xl font-bold leading-tight text-[#1e3a5f] sm:text-5xl">We’d be glad to hear from you</h1>
        <p className="mt-6 text-lg leading-8 text-gray-600">For questions about Uncle Bashi, our services or the work we are preparing, please check back for our public contact channels.</p>
        <div className="mt-8 rounded-2xl border border-[#eadfd4] bg-white p-6 shadow-sm">
          <p className="font-medium text-[#1e3a5f]">Contact details are being prepared</p>
          <p className="mt-2 text-sm leading-6 text-gray-600">There is no active contact form or published public contact channel on this page yet.</p>
        </div>
      </div>
    </section>
  </main>
);

export default ContactPage;
