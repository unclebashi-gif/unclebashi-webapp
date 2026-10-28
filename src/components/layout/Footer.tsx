import React from 'react';
import { Link } from 'react-router-dom';
import { getPathForView, type AppView } from '@/lib/navigation';
import { HeartIcon, ShieldIcon, BookIcon, UsersIcon, MapPinIcon, GlobeIcon } from '../ui/Icons';

type FooterLink = { label: string; view?: AppView; href?: string };
type FooterSection = { title: string; links: FooterLink[] };

const footerSections: FooterSection[] = [
  {
    title: 'EXPLORE',
    links: [
      { label: 'Courses', view: 'education' },
      { label: 'Marriage Matching', view: 'matchmaking' },
      { label: 'Coaching', view: 'coaching' },
      { label: 'Counselling', view: 'counselling' },
    ],
  },
  {
    title: 'RESOURCES',
    links: [
      { label: 'Media', view: 'media' },
      { label: 'Community', view: 'community' },
      { label: 'How It Works', href: '/#how-it-works' },
    ],
  },
  {
    title: 'UNCLE BASHI',
    links: [
      { label: 'Home', view: 'home' },
      { label: 'About Uncle Bashi', view: 'about' },
      { label: 'Contact', view: 'contact' },
      { label: 'Privacy Policy', view: 'privacy' },
      { label: 'Terms of Use', view: 'terms' },
    ],
  },
];

const trustBadges = [
  { icon: ShieldIcon, label: 'Verified Profiles' },
  { icon: BookIcon, label: 'Expert-Led Courses' },
  { icon: UsersIcon, label: 'Human Moderation' },
  { icon: HeartIcon, label: 'Values-First Matching' },
];

const pilotCountries = [
  { name: 'Uganda', flag: '🇺🇬', type: 'local' },
  { name: 'Kenya', flag: '🇰🇪', type: 'local' },
  { name: 'Rwanda', flag: '🇷🇼', type: 'local' },
  { name: 'Canada', flag: '🇨🇦', type: 'diaspora' },
];

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#1e3a5f] text-white">
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {trustBadges.map((badge) => {
              const Icon = badge.icon;
              return (
                <div key={badge.label} className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                    <Icon size={20} className="text-[#c4785a]" />
                  </div>
                  <span className="text-sm font-medium text-white/90">{badge.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8">
          <div className="sm:col-span-2">
            <div className="flex items-center mb-4">
              <img
                src="https://d64gsuwffb70l.cloudfront.net/697e2149ef322799a47a3b66_1773995591062_8973536f.png"
                alt="Uncle Bashi"
                className="h-10 w-auto"
              />
            </div>
            <p className="text-white/70 text-sm leading-relaxed mb-4">
              Guiding Relationships, Harmonizing Families. Building marriages that last through preparation, guidance, and intentional connection.
            </p>
            <div className="mt-4">
              <div className="flex items-center space-x-2 mb-3">
                <GlobeIcon size={16} className="text-[#c4785a]" />
                <span className="text-sm font-medium text-white/90">Currently Serving</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {pilotCountries.map((country) => (
                  <span
                    key={country.name}
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${country.type === 'local' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'}`}
                  >
                    <span className="mr-1">{country.flag}</span>
                    {country.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {footerSections.map((section) => (
            <nav key={section.title} aria-label={section.title}>
              <h4 className="font-semibold mb-4 text-white/90">{section.title}</h4>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.view ? (
                      <Link to={getPathForView(link.view)} className="text-sm text-white/60 hover:text-white transition-colors">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className="text-sm text-white/60 hover:text-white transition-colors">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-white/60">© {currentYear} Uncle Bashi. All rights reserved.</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-xs text-white/40 flex items-center">
                <MapPinIcon size={12} className="mr-1" />
                East Africa &amp; Diaspora
              </span>
              <span className="text-xs text-white/40">Your data is protected. We never sell personal information.</span>
            </div>
            <button
              type="button"
              aria-label="Back to top"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex h-10 w-10 items-center justify-center self-end rounded-full border border-white/30 text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4785a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e3a5f] sm:self-auto"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m-7 7 7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
