import React from 'react';
import { Link } from 'react-router-dom';

// This draft privacy policy requires formal legal review before unrestricted public launch.
export const PrivacyPage: React.FC = () => (
  <div className="bg-white">
    <section className="bg-[#faf6f1] py-14 sm:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#c4785a]">Privacy</p>
        <h1 className="text-4xl font-bold text-[#1e3a5f] sm:text-5xl">Privacy Policy</h1>
        <p className="mt-5 max-w-3xl leading-7 text-gray-600">This page describes, at a high level, how Uncle Bashi may handle information when you use the services currently available in the app. The details should be reviewed and updated as the product and its service providers change.</p>
      </div>
    </section>
    <article className="prose prose-slate mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h2>Information the service uses</h2>
      <p><strong>Account and profile information.</strong> This can include account identifiers, name, email address and profile details you choose to provide, such as age or date of birth, gender, location, biography and occupation.</p>
      <p><strong>Onboarding and matchmaking information.</strong> If you use these features, information may include marriage intentions, readiness answers, values you provide, profile and partner preferences, photos, interests, requests, blocks and safety reports. Faith, cultural and other sensitive details are user-declared and may be optional.</p>
      <p><strong>Education, coaching and community activity.</strong> The service may process course enrolments and progress, coaching booking requests and related operational details, and community posts, interactions or reports needed to provide and moderate those features.</p>
      <p><strong>Payments.</strong> Payment providers process payment approval and settlement. The app may keep transaction and access records, including payment status, amount, currency and limited or masked payer details. Payment providers handle payment credentials under their own terms; do not send a mobile-money PIN or password to Uncle Bashi.</p>
      <p><strong>Authentication and technical information.</strong> Supabase provides authentication and related application infrastructure. If Google sign-in is enabled and you choose it, Google may share account information needed to authenticate you. The service may also process technical and security events needed to operate and protect the app.</p>

      <h2>Why information is used</h2>
      <p>Information is used to create and secure accounts, support onboarding, show and operate the features you choose, apply matchmaking and eligibility rules, manage learning and bookings, process purchases through providers, respond to reports, prevent misuse, and maintain the service.</p>

      <h2>Access, service providers and security</h2>
      <p>Information is available to the systems and authorised personnel who need it to operate the relevant feature, provide support or address safety issues. Service providers may process information for hosting, authentication, payments and other app operations. We use access controls and security measures intended to protect information, but no online service can promise absolute security.</p>

      <h2>Retention and your choices</h2>
      <p>Information may be retained while needed to provide the service, maintain account and transaction records, address safety matters or meet applicable obligations. Available profile controls may let you review or change information. You may also ask about access, correction or deletion, subject to applicable requirements and records that must be retained.</p>
      <p>Use the public contact information on our <Link to="/contact">Contact page</Link> to make a privacy request. Public contact channels are still being prepared; a functioning contact method and the final handling process must be added before unrestricted public launch.</p>

      <h2>Policy updates</h2>
      <p>We may update this notice as the app changes. The current version will be posted on this page, with an updated date when revisions are made. Material changes should be communicated through an appropriate app or account channel where available.</p>
      <p>This policy is an introductory draft and is not a statement of certification or legal compliance. Please review it again as services, providers and applicable requirements are confirmed.</p>
    </article>
  </div>
);

export default PrivacyPage;