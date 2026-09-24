import React from 'react';
import { HeartIcon, ShieldIcon, BookIcon, UsersIcon, MapPinIcon, GlobeIcon } from '../ui/Icons';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    platform: [
      { label: 'About Us', href: '#about' },
      { label: 'How It Works', href: '#how-it-works' },
      { label: 'Success Stories', href: '#stories' },
      { label: 'Our Coaches', href: '#coaches' },
    ],
    resources: [
      { label: 'Marriage Courses', href: '#courses' },
      { label: 'Community Guidelines', href: '#guidelines' },
      { label: 'Blog', href: '#blog' },
      { label: 'FAQ', href: '#faq' },
    ],
    support: [
      { label: 'Contact Us', href: '#contact' },
      { label: 'Help Center', href: '#help' },
      { label: 'Report an Issue', href: '#report' },
      { label: 'Feedback', href: '#feedback' },
    ],
    legal: [
      { label: 'Privacy Policy', href: '#privacy' },
      { label: 'Terms of Service', href: '#terms' },
      { label: 'Cookie Policy', href: '#cookies' },
      { label: 'Safety Guidelines', href: '#safety' },
    ],
  };

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

  return (
    <footer className="bg-[#1e3a5f] text-white">
      {/* Trust badges */}
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {trustBadges.map((badge, index) => {
              const Icon = badge.icon;
              return (
                <div key={index} className="flex items-center space-x-3">
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

      {/* Main footer content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8">
          {/* Brand column */}
          <div className="col-span-2">
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
            
            {/* Countries served */}
            <div className="mt-4">
              <div className="flex items-center space-x-2 mb-3">
                <GlobeIcon size={16} className="text-[#c4785a]" />
                <span className="text-sm font-medium text-white/90">Currently Serving</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {pilotCountries.map((country) => (
                  <span 
                    key={country.name}
                    className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                      country.type === 'local' 
                        ? 'bg-emerald-500/20 text-emerald-300' 
                        : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    <span className="mr-1">{country.flag}</span>
                    {country.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Links columns */}
          <div>
            <h4 className="font-semibold mb-4 text-white/90">Platform</h4>
            <ul className="space-y-2">
              {footerLinks.platform.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-white/90">Resources</h4>
            <ul className="space-y-2">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-white/90">Support</h4>
            <ul className="space-y-2">
              {footerLinks.support.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-white/90">Legal</h4>
            <ul className="space-y-2">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between">
          <p className="text-sm text-white/60">
            © {currentYear} Uncle Bashi. All rights reserved.
          </p>
          <div className="mt-4 md:mt-0 flex items-center space-x-4">
            <span className="text-xs text-white/40 flex items-center">
              <MapPinIcon size={12} className="mr-1" />
              East Africa & Diaspora
            </span>
            <span className="text-xs text-white/40">
              Your data is protected. We never sell personal information.
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
