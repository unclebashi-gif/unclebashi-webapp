import React from 'react';
import { IMAGES } from '@/lib/constants';
import { StarIcon, MapPinIcon } from '../ui/Icons';

export const TestimonialsSection: React.FC = () => {
  const testimonials = [
    {
      name: 'Sarah & Michael',
      image: IMAGES.hero,
      location: 'Kampala, Uganda',
      region: 'East Africa',
      quote: 'The courses helped us have conversations we never would have had otherwise. We went into our marriage with eyes wide open and hearts fully prepared.',
      rating: 5,
      type: 'Married through Uncle Bashi',
    },
    {
      name: 'Amara W.',
      image: IMAGES.profiles.women[0],
      location: 'Nairobi, Kenya',
      region: 'East Africa',
      quote: 'After years of frustrating dating apps, Uncle Bashi felt like a breath of fresh air. The focus on preparation over matching helped me understand what I truly want.',
      rating: 5,
      type: 'Course Graduate',
    },
    {
      name: 'David K.',
      image: IMAGES.profiles.men[0],
      location: 'Toronto, Canada',
      region: 'Diaspora',
      quote: 'The coaching sessions were transformative. Having someone guide me through self-reflection helped me become the partner I want to be.',
      rating: 5,
      type: 'Coaching Client',
    },
    {
      name: 'Grace & Emmanuel',
      image: IMAGES.family,
      location: 'Kigali, Rwanda',
      region: 'East Africa',
      quote: 'We appreciated that Uncle Bashi took the time to verify profiles and review matches. It gave us confidence that everyone here is serious about marriage.',
      rating: 5,
      type: 'Engaged through Uncle Bashi',
    },
    {
      name: 'Fatima A.',
      image: IMAGES.profiles.women[1],
      location: 'Vancouver, Canada',
      region: 'Diaspora',
      quote: 'The community discussions helped me realize I wasn\'t alone in my questions and concerns. The moderation kept everything respectful and meaningful.',
      rating: 5,
      type: 'Community Member',
    },
    {
      name: 'James O.',
      image: IMAGES.profiles.men[1],
      location: 'Mombasa, Kenya',
      region: 'East Africa',
      quote: 'I came to Uncle Bashi skeptical, but the structured approach won me over. The courses are genuinely helpful, not just boxes to check.',
      rating: 5,
      type: 'Course Graduate',
    },
  ];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#1e3a5f] mb-4">
            Stories of Preparation
          </h2>
          <p className="text-lg text-gray-600">
            Real people, real journeys. Hear from those who've walked the path of intentional preparation across East Africa and the Diaspora.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="bg-[#faf6f1] rounded-xl p-6 hover:shadow-md transition-shadow duration-300"
            >
              {/* Rating */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-1">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <StarIcon key={i} size={16} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  testimonial.region === 'East Africa' 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {testimonial.region}
                </span>
              </div>

              {/* Quote */}
              <p className="text-gray-700 mb-6 leading-relaxed">"{testimonial.quote}"</p>

              {/* Author */}
              <div className="flex items-center space-x-3">
                <img
                  src={testimonial.image}
                  alt={testimonial.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div>
                  <p className="font-semibold text-[#1e3a5f]">{testimonial.name}</p>
                  <div className="flex items-center text-sm text-gray-500">
                    <MapPinIcon size={12} className="mr-1" />
                    {testimonial.location}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats callout */}
        <div className="mt-16 bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] rounded-2xl p-8 lg:p-12">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-4xl lg:text-5xl font-bold text-white mb-2">4</p>
              <p className="text-white/80">Countries Served</p>
            </div>
            <div>
              <p className="text-4xl lg:text-5xl font-bold text-white mb-2">95%</p>
              <p className="text-white/80">Course Completion Rate</p>
            </div>
            <div>
              <p className="text-4xl lg:text-5xl font-bold text-white mb-2">4.9/5</p>
              <p className="text-white/80">Average Satisfaction</p>
            </div>
            <div>
              <p className="text-4xl lg:text-5xl font-bold text-white mb-2">89%</p>
              <p className="text-white/80">Would Recommend</p>
            </div>
          </div>
          
          {/* Countries served */}
          <div className="mt-8 pt-8 border-t border-white/20">
            <p className="text-white/80 text-center mb-4">Currently serving</p>
            <div className="flex flex-wrap justify-center gap-4">
              {['Uganda', 'Kenya', 'Rwanda', 'Canada (Diaspora)'].map((country) => (
                <span 
                  key={country}
                  className="px-4 py-2 bg-white/10 rounded-full text-white text-sm font-medium"
                >
                  {country}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
