// Image URLs
export const IMAGES = {
  hero: 'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769873867394_8ce935bf.jpg',
  family: 'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769873932031_d2ea0f13.png',
  community: 'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769874016700_9c06852a.jpg',
  journey: 'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769874002190_9e9d14a0.png',
  profiles: {
    women: [
      'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769873879001_1580b3fd.jpg',
      'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769873882143_cfb970f2.jpg',
      'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769873883671_1c1d7623.jpg',
    ],
    men: [
      'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769873898064_1f317296.jpg',
      'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769873903394_8965d189.jpg',
      'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769873900060_114a3d05.jpg',
    ],
  },
  coaches: [
    'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769873946238_c25da439.jpg',
    'https://d64gsuwffb70l.cloudfront.net/697e215e91e803d9decc1e17_1769873971259_cfa4c766.png',
  ],
};

// Color palette
export const COLORS = {
  navy: '#1e3a5f',
  navyLight: '#2d4a6f',
  terracotta: '#c4785a',
  terracottaLight: '#d4917a',
  cream: '#faf6f1',
  creamDark: '#f0e8df',
  warmGray: '#6b7280',
  success: '#059669',
  warning: '#d97706',
  error: '#dc2626',
};

// Onboarding steps
export const ONBOARDING_STEPS = [
  { id: 1, title: 'Welcome', description: 'Introduction to Uncle Bashi' },
  { id: 2, title: 'Your Journey', description: 'What brings you here?' },
  { id: 3, title: 'Personal Info', description: 'Basic information' },
  { id: 4, title: 'Values', description: 'What matters most to you' },
  { id: 5, title: 'Intentions', description: 'Your marriage intentions' },
  { id: 6, title: 'Commitment', description: 'Your commitment level' },
  { id: 7, title: 'Readiness', description: 'Self-assessment' },
  { id: 8, title: 'Verification', description: 'Identity verification' },
  { id: 9, title: 'Agreement', description: 'Community guidelines' },
  { id: 10, title: 'Complete', description: 'Ready to begin' },
];

// Values options for assessment
export const VALUES_OPTIONS = [
  { id: 'faith', label: 'Faith & Spirituality', icon: 'heart' },
  { id: 'family', label: 'Family & Tradition', icon: 'users' },
  { id: 'integrity', label: 'Integrity & Honesty', icon: 'shield' },
  { id: 'growth', label: 'Personal Growth', icon: 'trending-up' },
  { id: 'service', label: 'Service & Community', icon: 'hands-helping' },
  { id: 'education', label: 'Education & Learning', icon: 'book' },
  { id: 'stability', label: 'Stability & Security', icon: 'home' },
  { id: 'respect', label: 'Mutual Respect', icon: 'handshake' },
  { id: 'communication', label: 'Open Communication', icon: 'message-circle' },
  { id: 'commitment', label: 'Lifelong Commitment', icon: 'link' },
];

// Marriage intentions
export const MARRIAGE_INTENTIONS = [
  {
    id: 'seeking_marriage',
    title: 'Seeking Marriage',
    description: 'I am single and actively preparing to find a life partner',
    icon: 'search',
  },
  {
    id: 'preparing_for_marriage',
    title: 'Preparing for Marriage',
    description: 'I am in a relationship and preparing for marriage',
    icon: 'calendar',
  },
  {
    id: 'strengthening_marriage',
    title: 'Strengthening Marriage',
    description: 'I am married and want to strengthen my relationship',
    icon: 'heart',
  },
];

// Commitment levels
export const COMMITMENT_LEVELS = [
  {
    id: 'exploring',
    title: 'Exploring',
    description: 'I am learning about marriage preparation',
    color: 'bg-blue-100 text-blue-800',
  },
  {
    id: 'serious',
    title: 'Serious',
    description: 'I am committed to the preparation process',
    color: 'bg-amber-100 text-amber-800',
  },
  {
    id: 'ready',
    title: 'Ready',
    description: 'I am ready to begin the matching process',
    color: 'bg-green-100 text-green-800',
  },
];

// Community tiers
export const COMMUNITY_TIERS = [
  {
    id: 'open',
    title: 'Open Discussions',
    description: 'General discussions with the community',
    requirement: 'Complete onboarding',
    icon: 'globe',
  },
  {
    id: 'guided',
    title: 'Guided Groups',
    description: 'Moderator-led small group discussions',
    requirement: 'Complete 1 course',
    icon: 'users',
  },
  {
    id: 'preparation',
    title: 'Preparation Circles',
    description: 'Deep preparation with matched readiness levels',
    requirement: 'Complete all required courses',
    icon: 'circle',
  },
];

// Readiness assessment questions
export const READINESS_QUESTIONS = [
  {
    id: 'emotional',
    question: 'I feel emotionally stable and ready for a committed relationship',
    category: 'Emotional Readiness',
  },
  {
    id: 'financial',
    question: 'I have a stable financial foundation or a clear plan for one',
    category: 'Practical Readiness',
  },
  {
    id: 'communication',
    question: 'I can communicate my needs and listen to others effectively',
    category: 'Relational Skills',
  },
  {
    id: 'conflict',
    question: 'I can handle disagreements without becoming defensive or withdrawn',
    category: 'Relational Skills',
  },
  {
    id: 'accountability',
    question: 'I take responsibility for my actions and mistakes',
    category: 'Character',
  },
  {
    id: 'growth',
    question: 'I am committed to personal growth and self-improvement',
    category: 'Character',
  },
  {
    id: 'expectations',
    question: 'I have realistic expectations about marriage',
    category: 'Emotional Readiness',
  },
  {
    id: 'support',
    question: 'I have a support system of family or friends',
    category: 'Practical Readiness',
  },
];
