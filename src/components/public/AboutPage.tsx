import React from 'react';

export const AboutPage: React.FC = () => (
  <div className="bg-white">
    <section className="bg-[#faf6f1] py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#c4785a]">About Uncle Bashi</p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight text-[#1e3a5f] sm:text-5xl">Preparing for stronger marriages and steadier families</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-gray-600">
          Uncle Bashi brings together marriage preparation, relationship education, intentional matching, coaching and a developing counselling pathway. Our aim is to help people approach marriage and family life with care, clarity and purpose.
        </p>
      </div>
    </section>
    <section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:px-6 lg:px-8 md:grid-cols-2">
      <article>
        <h2 className="text-2xl font-semibold text-[#1e3a5f]">Preparation before pressure</h2>
        <p className="mt-4 leading-7 text-gray-600">We believe thoughtful preparation and learning can help people make more intentional relationship choices. Our approach centres on values, communication, family context and personal readiness rather than quick promises.</p>
      </article>
      <article>
        <h2 className="text-2xl font-semibold text-[#1e3a5f]">Rooted in East Africa and its diaspora</h2>
        <p className="mt-4 leading-7 text-gray-600">The platform is designed with East African relationships, cultures and family realities in mind, including the experiences of people building lives across borders.</p>
      </article>
    </section>
  </div>
);

export default AboutPage;