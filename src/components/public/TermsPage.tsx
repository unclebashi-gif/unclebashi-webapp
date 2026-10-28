import React from 'react';
import { Link } from 'react-router-dom';

// This draft Terms of Use requires formal legal review before unrestricted public launch.
export const TermsPage: React.FC = () => (
  <div className="bg-white">
    <section className="bg-[#faf6f1] py-14 sm:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#c4785a]">Terms</p>
        <h1 className="text-4xl font-bold text-[#1e3a5f] sm:text-5xl">Terms of Use</h1>
        <p className="mt-5 max-w-3xl leading-7 text-gray-600">These introductory terms describe expected use of Uncle Bashi. They should be reviewed and completed for the services and locations in which the platform operates.</p>
      </div>
    </section>
    <article className="prose prose-slate mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h2>Accounts and eligibility</h2>
      <p>You are responsible for keeping your sign-in details secure and for activity through your account. Provide information that is accurate to the best of your knowledge and update it when it materially changes. You must meet the eligibility requirements shown for the service you use.</p>

      <h2>Acceptable use and community conduct</h2>
      <p>Use the platform respectfully and lawfully. Do not harass, threaten, deceive, impersonate, defraud, exploit or solicit other members, misuse their information, upload material you do not have permission to share, or attempt to bypass safety or access controls. Community spaces require respectful, non-abusive participation and compliance with the posted community rules.</p>

      <h2>Matching, education and support</h2>
      <p>Matchmaking is intended to support serious introductions. A profile, recommendation or accepted interest is not a guarantee of marriage, compatibility, a relationship outcome or another person’s identity or conduct. Use your own judgment and report safety concerns through available app features.</p>
      <p>Educational and coaching materials are general support and are not a substitute for advice or care from a licensed clinical or legal professional. They are not emergency services. The counselling pathway is in development; if it becomes operational, any operational counselling service will be governed by applicable professional terms and information provided at that time.</p>

      <h2>Payments</h2>
      <p>Prices and purchase conditions are shown for the relevant service at checkout. Payments are handled through the payment provider presented for that purchase. Refunds, cancellations and related terms are those presented for the service and provider, together with any rights that apply to you.</p>

      <h2>Intellectual property</h2>
      <p>Uncle Bashi and its licensors retain rights in platform materials and branding. You may use materials for your personal, permitted use of the service. Do not copy, redistribute or commercially exploit them without permission, except where the law allows.</p>

      <h2>Suspension and termination</h2>
      <p>Access may be restricted or an account suspended or closed when needed to protect people, enforce these terms, address suspected misuse or comply with applicable requirements. Where appropriate and practical, we will provide information about the action and available next steps.</p>

      <h2>Availability and updates</h2>
      <p>Features may change or be temporarily unavailable. To the extent permitted by applicable law, the service is provided as available, and nothing in these terms limits rights or responsibilities that cannot legally be limited. We may revise these terms by posting an updated version here and, where appropriate, notifying users through an available channel.</p>
      <p>These introductory terms are a draft for product use and do not establish jurisdiction-specific protections. Formal legal review is required before unrestricted public launch. For current contact information, see the <Link to="/contact">Contact page</Link>.</p>
    </article>
  </div>
);

export default TermsPage;