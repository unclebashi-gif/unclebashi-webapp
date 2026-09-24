import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { useCourseProgress } from '@/hooks/useCourseProgress';
import { usePayments } from '@/hooks/usePayments';
import { useGeolocation, COUNTRY_NAMES } from '@/hooks/useGeolocation';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { VideoPlayer } from '../video/VideoPlayer';
import { PaymentModal } from '../payment/PaymentModal';
import { IMAGES } from '@/lib/constants';
import {
  BookIcon,
  PlayIcon,
  ClockIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  AwardIcon,
  StarIcon,
  LockIcon,
  UnlockIcon,
  CreditCardIcon,
} from '../ui/Icons';

interface Lesson {
  id: string;
  title: string;
  description: string;
  contentType: string;
  durationMinutes: number;
  orderIndex: number;
  reflectionPrompts: string[];
  completed?: boolean;
  videoUrl?: string;
  readinessBonus?: number;
}

interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  durationMinutes: number;
  orderIndex: number;
  isRequired: boolean;
  isFree: boolean;
  isPremium?: boolean;
  price?: number;
  thumbnailUrl: string;
  lessons?: Lesson[];
  progress?: number;
  status?: 'not_started' | 'in_progress' | 'completed';
}

export const EducationHub: React.FC = () => {
  const { user, setCurrentView, updateUser } = useAppStore();
  const { 
    courseProgress, 
    lessonProgress, 
    isLessonCompleted, 
    getCourseProgress,
    saveReflection,
    getTotalReadinessPoints,
    isLoading: progressLoading 
  } = useCourseProgress();
  
  const { hasPurchased, getLocalPrice, refreshPurchases } = usePayments(user?.id);
  const { location } = useGeolocation();
  
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPremiumCourse, setSelectedPremiumCourse] = useState<Course | null>(null);

  const countryCode = location?.countryCode || 'CA';

  useEffect(() => {
    // Load courses with the new simplified structure
    const sampleCourses: Course[] = [
      // FREE Overview Video - The Gateway Course (10 minutes total)
      {
        id: 'free-overview',
        title: 'Marriage Preparation Overview',
        description: 'A FREE 10-minute introduction to intentional marriage preparation. Get a taste of what Uncle Bashi offers and start your journey today!',
        category: 'overview',
        durationMinutes: 10,
        orderIndex: 0,
        isRequired: false,
        isFree: true,
        thumbnailUrl: IMAGES.hero,
        progress: 0,
        status: 'not_started',
        lessons: [
          { 
            id: 'overview-1', 
            title: 'Welcome to Uncle Bashi', 
            description: 'Introduction to intentional marriage preparation and what makes our approach unique', 
            contentType: 'video', 
            durationMinutes: 3, 
            orderIndex: 1, 
            reflectionPrompts: ['What brought you to Uncle Bashi?', 'What does intentional marriage mean to you?'], 
            completed: false,
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            readinessBonus: 5,
          },
          { 
            id: 'overview-2', 
            title: 'The Journey Ahead', 
            description: 'Overview of the preparation process and how Uncle Bashi guides you', 
            contentType: 'video', 
            durationMinutes: 4, 
            orderIndex: 2, 
            reflectionPrompts: ['What do you hope to learn?', 'What areas of marriage preparation interest you most?'], 
            completed: false,
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            readinessBonus: 5,
          },
          { 
            id: 'overview-3', 
            title: 'Your First Step', 
            description: 'How to make the most of this platform and begin your journey', 
            contentType: 'video', 
            durationMinutes: 3, 
            orderIndex: 3, 
            reflectionPrompts: ['What is one thing you want to work on?', 'How committed are you to this journey?'], 
            completed: false,
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            readinessBonus: 5,
          },
        ],
      },
      // PREMIUM Full Course (45 minutes)
      {
        id: 'premium-full-course',
        title: 'Complete Pre-Marriage Course',
        description: 'Our comprehensive 45-minute course covering all essential aspects of marriage preparation. Deep dive into values, communication, conflict resolution, and more.',
        category: 'premium',
        durationMinutes: 45,
        orderIndex: 1,
        isRequired: false,
        isFree: false,
        isPremium: true,
        price: 29,
        thumbnailUrl: IMAGES.journey,
        progress: 0,
        status: 'not_started',
        lessons: [
          { id: 'p1', title: 'Understanding Your Values', description: 'Deep exploration of core values that guide your life', contentType: 'video', durationMinutes: 8, orderIndex: 1, reflectionPrompts: ['What are your top 5 values?'], completed: false, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', readinessBonus: 8 },
          { id: 'p2', title: 'Communication Foundations', description: 'Building healthy communication patterns for lasting connection', contentType: 'video', durationMinutes: 10, orderIndex: 2, reflectionPrompts: ['How do you currently communicate in relationships?'], completed: false, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', readinessBonus: 8 },
          { id: 'p3', title: 'Conflict Resolution', description: 'Navigating disagreements constructively and growing together', contentType: 'video', durationMinutes: 8, orderIndex: 3, reflectionPrompts: ['How do you handle conflict?'], completed: false, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', readinessBonus: 8 },
          { id: 'p4', title: 'Financial Partnership', description: 'Building financial harmony and shared goals', contentType: 'video', durationMinutes: 7, orderIndex: 4, reflectionPrompts: ['What are your financial goals?'], completed: false, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', readinessBonus: 8 },
          { id: 'p5', title: 'Family & Future Planning', description: 'Aligning on life goals and building your shared vision', contentType: 'video', durationMinutes: 7, orderIndex: 5, reflectionPrompts: ['What does your ideal future look like?'], completed: false, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', readinessBonus: 8 },
          { id: 'p6', title: 'Your Readiness Assessment', description: 'Final reflection and next steps on your journey', contentType: 'reflection', durationMinutes: 5, orderIndex: 6, reflectionPrompts: ['What have you learned about yourself?', 'What areas do you want to continue growing in?'], completed: false, readinessBonus: 10 },
        ],
      },
      // Additional Optional Courses
      {
        id: '11111111-1111-1111-1111-111111111111',
        title: 'Marriage Readiness Foundations',
        description: 'Understand what it truly means to be ready for marriage. Explore your motivations, expectations, and personal readiness.',
        category: 'marriage_readiness',
        durationMinutes: 120,
        orderIndex: 2,
        isRequired: false,
        isFree: false,
        isPremium: true,
        price: 19,
        thumbnailUrl: IMAGES.journey,
        progress: 33,
        status: 'in_progress',
        lessons: [
          { id: '1', title: 'Why Marriage?', description: 'Explore your motivations', contentType: 'video', durationMinutes: 15, orderIndex: 1, reflectionPrompts: ['What draws you to marriage?'], completed: true, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', readinessBonus: 5 },
          { id: '2', title: 'Self-Assessment', description: 'Evaluate your readiness', contentType: 'reflection', durationMinutes: 20, orderIndex: 2, reflectionPrompts: ['What areas feel stable?'], completed: false, readinessBonus: 5 },
          { id: '3', title: 'Expectations vs Reality', description: 'Understanding realistic expectations', contentType: 'article', durationMinutes: 15, orderIndex: 3, reflectionPrompts: ['What expectations do you have?'], completed: false, readinessBonus: 5 },
        ],
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        title: 'Character & Accountability',
        description: 'Build the character traits essential for a lasting marriage. Learn about integrity, responsibility, and personal growth.',
        category: 'character_accountability',
        durationMinutes: 90,
        orderIndex: 3,
        isRequired: false,
        isFree: false,
        isPremium: true,
        price: 19,
        thumbnailUrl: IMAGES.journey,
        progress: 0,
        status: 'not_started',
        lessons: [
          { id: '4', title: 'The Foundation of Integrity', description: 'Building trust through character', contentType: 'video', durationMinutes: 20, orderIndex: 1, reflectionPrompts: ['How do you demonstrate integrity?'], completed: false, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', readinessBonus: 5 },
          { id: '5', title: 'Taking Responsibility', description: 'Owning your actions', contentType: 'reflection', durationMinutes: 15, orderIndex: 2, reflectionPrompts: ['What areas do you take responsibility for?'], completed: false, readinessBonus: 5 },
        ],
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        title: 'Communication Essentials',
        description: 'Master the art of healthy communication. Learn to express needs, listen actively, and navigate difficult conversations.',
        category: 'communication_conflict',
        durationMinutes: 100,
        orderIndex: 4,
        isRequired: false,
        isFree: false,
        isPremium: true,
        price: 19,
        thumbnailUrl: IMAGES.community,
        progress: 0,
        status: 'not_started',
        lessons: [
          { id: '6', title: 'Active Listening', description: 'Truly hearing your partner', contentType: 'video', durationMinutes: 20, orderIndex: 1, reflectionPrompts: ['How well do you listen?'], completed: false, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', readinessBonus: 5 },
          { id: '7', title: 'Expressing Needs', description: 'Communicating clearly and kindly', contentType: 'article', durationMinutes: 15, orderIndex: 2, reflectionPrompts: ['How comfortable are you expressing needs?'], completed: false, readinessBonus: 5 },
        ],
      },
    ];

    setCourses(sampleCourses);
    setIsLoading(false);
  }, []);

  // Check if user has access to a course (purchased or free)
  const hasAccess = (course: Course): boolean => {
    if (course.isFree) return true;
    return hasPurchased(course.id);
  };

  // Handle payment success
  const handlePaymentSuccess = (receipt: any) => {
    refreshPurchases();
    setShowPaymentModal(false);
    if (selectedPremiumCourse) {
      setSelectedCourse(selectedPremiumCourse);
    }
    setSelectedPremiumCourse(null);
  };

  // Handle premium course click - show payment modal or open course if purchased
  const handlePremiumCourseClick = (course: Course) => {
    if (hasAccess(course)) {
      setSelectedCourse(course);
    } else {
      setSelectedPremiumCourse(course);
      setShowPaymentModal(true);
    }
  };



  // Merge database progress with course data
  const getCoursesWithProgress = (): Course[] => {
    return courses.map(course => {
      const dbProgress = getCourseProgress(course.id);
      const lessonsWithProgress = course.lessons?.map(lesson => ({
        ...lesson,
        completed: isLessonCompleted(lesson.id),
      }));
      
      const completedCount = lessonsWithProgress?.filter(l => l.completed).length || 0;
      const totalLessons = lessonsWithProgress?.length || 1;
      const calculatedProgress = Math.round((completedCount / totalLessons) * 100);
      
      return {
        ...course,
        lessons: lessonsWithProgress,
        progress: dbProgress?.progress ?? calculatedProgress,
        status: dbProgress?.status ?? (completedCount === 0 ? 'not_started' : completedCount === totalLessons ? 'completed' : 'in_progress'),
      };
    });
  };

  const coursesWithProgress = getCoursesWithProgress();
  const freeCourse = coursesWithProgress.find((c) => c.isFree);
  const premiumCourses = coursesWithProgress.filter((c) => c.isPremium);
  const totalProgress = coursesWithProgress.length > 0
    ? Math.round(coursesWithProgress.reduce((sum, c) => sum + (c.progress || 0), 0) / coursesWithProgress.length)
    : 0;

  const completedCourses = coursesWithProgress.filter((c) => c.status === 'completed').length;

  const handleLessonComplete = (courseId: string, lessonId: string) => {
    // Progress is now tracked in the database via useCourseProgress hook
    // The VideoPlayer component handles saving progress automatically
  };



  if (selectedLesson && selectedCourse) {
    return (
      <LessonView
        lesson={selectedLesson}
        course={selectedCourse}
        onBack={() => setSelectedLesson(null)}
        onComplete={() => handleLessonComplete(selectedCourse.id, selectedLesson.id)}
        saveReflection={saveReflection}
      />
    );
  }

  if (selectedCourse) {
    return (
      <CourseDetail
        course={selectedCourse}
        onBack={() => setSelectedCourse(null)}
        onSelectLesson={setSelectedLesson}
        onLessonComplete={(lessonId) => handleLessonComplete(selectedCourse.id, lessonId)}
        isLessonCompleted={isLessonCompleted}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#faf6f1] py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1e3a5f] mb-2">Marriage Preparation</h1>
          <p className="text-gray-600">
            Build a strong foundation for your future marriage with our courses.
          </p>
        </div>

        {/* FREE Course Highlight - Beta Banner */}
        {freeCourse && (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 mb-8 text-white shadow-lg">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="relative flex-shrink-0">
                <div className="w-32 h-32 rounded-xl overflow-hidden shadow-lg">
                  <img
                    src={freeCourse.thumbnailUrl}
                    alt={freeCourse.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 px-3 py-1 rounded-full text-xs font-bold shadow">
                  FREE
                </div>
              </div>
              
              <div className="flex-1 text-center md:text-left">
                <div className="inline-flex items-center px-3 py-1 bg-white/20 rounded-full text-sm mb-2">
                  <StarIcon size={14} className="mr-1" />
                  Beta Launch Special
                </div>
                <h2 className="text-2xl font-bold mb-2">{freeCourse.title}</h2>
                <p className="text-white/90 mb-4 max-w-xl">
                  {freeCourse.description}
                </p>
                <div className="flex flex-wrap items-center gap-4 justify-center md:justify-start">
                  <span className="flex items-center text-sm">
                    <ClockIcon size={16} className="mr-1" />
                    {freeCourse.durationMinutes} minutes
                  </span>
                  <span className="flex items-center text-sm">
                    <PlayIcon size={16} className="mr-1" />
                    {freeCourse.lessons?.length} short videos
                  </span>
                  <span className="flex items-center text-sm bg-white/20 px-2 py-1 rounded-full">
                    <AwardIcon size={14} className="mr-1" />
                    +15 Readiness Points
                  </span>
                </div>
              </div>

              <div className="flex-shrink-0">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => setSelectedCourse(freeCourse)}
                  className="bg-white text-emerald-600 hover:bg-gray-100 shadow-lg"
                >
                  <PlayIcon size={18} className="mr-2" />
                  {freeCourse.progress && freeCourse.progress > 0 ? 'Continue Watching' : 'Start Free Course'}
                </Button>
              </div>
            </div>
            
            {/* Progress indicator for free course */}
            {freeCourse.progress !== undefined && freeCourse.progress > 0 && (
              <div className="mt-4 pt-4 border-t border-white/20">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span>Your Progress</span>
                  <span>{freeCourse.progress}% Complete</span>
                </div>
                <div className="h-2 bg-white/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white rounded-full transition-all duration-500"
                    style={{ width: `${freeCourse.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progress Overview */}
        <div className="bg-white rounded-2xl p-6 mb-8 shadow-sm">
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">Overall Progress</p>
              <div className="flex items-center space-x-3">
                <ProgressBar progress={totalProgress} size="lg" color="primary" className="flex-1" />
                <span className="text-lg font-bold text-[#1e3a5f]">{totalProgress}%</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-1">Courses Completed</p>
              <p className="text-2xl font-bold text-[#1e3a5f]">
                {completedCourses} / {coursesWithProgress.length}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-1">Readiness Score</p>
              <p className="text-2xl font-bold text-[#c4785a]">{user?.readinessScore || 0}%</p>
            </div>
          </div>
          
          {/* Sync status */}
          {!progressLoading && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Total points earned from courses: <span className="font-semibold text-[#c4785a]">{getTotalReadinessPoints()}</span>
              </span>
              <span className="flex items-center text-emerald-600">
                <CheckCircleIcon size={14} className="mr-1" />
                Progress synced across devices
              </span>
            </div>
          )}
        </div>

        {/* Premium Full Course - Featured */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-[#1e3a5f] mb-4 flex items-center">
            <AwardIcon size={24} className="mr-2 text-[#c4785a]" />
            Recommended: Complete Pre-Marriage Course
          </h2>
          
          {premiumCourses.slice(0, 1).map((course) => (
            <div
              key={course.id}
              className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer border-2 border-[#c4785a]/20"
              onClick={() => handlePremiumCourseClick(course)}
            >
              <div className="flex flex-col md:flex-row">
                <div className="relative md:w-64 h-48 md:h-auto flex-shrink-0">
                  <img
                    src={course.thumbnailUrl}
                    alt={course.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="bg-[#c4785a] text-white px-3 py-1 rounded-full text-sm font-medium">
                      ${course.price} USD
                    </span>
                  </div>
                </div>
                
                <div className="p-6 flex-1">
                  <h3 className="text-xl font-bold text-[#1e3a5f] mb-2">{course.title}</h3>
                  <p className="text-gray-600 mb-4">{course.description}</p>
                  
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-4">
                    <span className="flex items-center">
                      <ClockIcon size={14} className="mr-1" />
                      {course.durationMinutes} minutes
                    </span>
                    <span className="flex items-center">
                      <BookIcon size={14} className="mr-1" />
                      {course.lessons?.length} lessons
                    </span>
                    <span className="flex items-center text-emerald-600">
                      <CheckCircleIcon size={14} className="mr-1" />
                      Certificate included
                    </span>
                    <span className="flex items-center text-[#c4785a]">
                      <AwardIcon size={14} className="mr-1" />
                      +50 Readiness Points
                    </span>
                  </div>

                  <Button>
                    Enroll Now - ${course.price}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Additional Courses Grid */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-[#1e3a5f] mb-4">Additional Courses</h2>
          
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-[#1e3a5f] border-t-transparent rounded-full mx-auto" />
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {premiumCourses.slice(1).map((course) => (
                <div
                  key={course.id}
                  className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
                  onClick={() => handlePremiumCourseClick(course)}
                >
                  <div className="relative h-40">
                    <img
                      src={course.thumbnailUrl}
                      alt={course.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    
                    {/* Price badge */}
                    <div className="absolute top-3 right-3">
                      <span className="bg-[#c4785a] text-white px-2 py-1 rounded-full text-xs font-medium">
                        ${course.price}
                      </span>
                    </div>

                    {/* Status badge */}
                    {course.status === 'completed' && (
                      <div className="absolute top-3 left-3">
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-xs font-medium flex items-center">
                          <CheckCircleIcon size={12} className="mr-1" />
                          Completed
                        </span>
                      </div>
                    )}
                    {course.status === 'in_progress' && (
                      <div className="absolute top-3 left-3">
                        <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-medium">
                          In Progress
                        </span>
                      </div>
                    )}

                    <div className="absolute bottom-3 left-3 right-3">
                      <h3 className="text-white font-semibold text-lg">{course.title}</h3>
                    </div>
                  </div>

                  <div className="p-4">
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">{course.description}</p>
                    
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                      <span className="flex items-center">
                        <ClockIcon size={14} className="mr-1" />
                        {course.durationMinutes} min
                      </span>
                      <span className="flex items-center">
                        <BookIcon size={14} className="mr-1" />
                        {course.lessons?.length || 0} lessons
                      </span>
                    </div>

                    {course.progress !== undefined && course.progress > 0 && (
                      <ProgressBar progress={course.progress} size="sm" color="secondary" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Encouragement Banner - Non-blocking */}
        <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] rounded-2xl p-6 text-center">
          <AwardIcon size={32} className="text-[#c4785a] mx-auto mb-3" />
          <h3 className="text-xl font-bold text-white mb-2">Enhance Your Journey</h3>
          <p className="text-white/80 mb-4 max-w-lg mx-auto">
            While you can start matching right away, completing our courses helps you build 
            a stronger foundation and increases your readiness score.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => setCurrentView('matchmaking')}
            >
              Go to Matchmaking
            </Button>
            {freeCourse && (
              <Button
                variant="outline"
                onClick={() => setSelectedCourse(freeCourse)}
                className="border-white text-white hover:bg-white/10"
              >
                Watch Free Overview
              </Button>
            )}
          </div>
        </div>

      </div>


      {/* Payment Modal */}
      {showPaymentModal && selectedPremiumCourse && user && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedPremiumCourse(null);
          }}
          course={{
            id: selectedPremiumCourse.id,
            title: selectedPremiumCourse.title,
            price: selectedPremiumCourse.price || 0,
            description: selectedPremiumCourse.description,
          }}
          userId={user.id}
          userEmail={user.email || ''}
          userName={user.name || ''}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
};



// Course Detail View
const CourseDetail: React.FC<{
  course: Course;
  onBack: () => void;
  onSelectLesson: (lesson: Lesson) => void;
  onLessonComplete: (lessonId: string) => void;
  isLessonCompleted: (lessonId: string) => boolean;
}> = ({ course, onBack, onSelectLesson, onLessonComplete, isLessonCompleted }) => {
  const [activeVideoLesson, setActiveVideoLesson] = useState<Lesson | null>(null);

  // Auto-select first incomplete video lesson for free course
  useEffect(() => {
    if (course.isFree && course.lessons) {
      const firstIncomplete = course.lessons.find(l => !isLessonCompleted(l.id) && l.contentType === 'video');
      if (firstIncomplete) {
        setActiveVideoLesson(firstIncomplete);
      }
    }
  }, [course, isLessonCompleted]);

  const handleVideoComplete = (lessonId: string) => {
    onLessonComplete(lessonId);
    // Move to next lesson
    if (course.lessons) {
      const currentIndex = course.lessons.findIndex(l => l.id === lessonId);
      const nextLesson = course.lessons[currentIndex + 1];
      if (nextLesson && nextLesson.contentType === 'video') {
        setTimeout(() => setActiveVideoLesson(nextLesson), 1500);
      }
    }
  };

  // Calculate progress from completed lessons
  const completedCount = course.lessons?.filter(l => isLessonCompleted(l.id)).length || 0;
  const totalLessons = course.lessons?.length || 1;
  const calculatedProgress = Math.round((completedCount / totalLessons) * 100);

  return (
    <div className="min-h-screen bg-[#faf6f1] py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" onClick={onBack} className="mb-6">
          ← Back to Courses
        </Button>

        {/* Course header */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-8">
          {/* Video Player for active lesson */}
          {activeVideoLesson && activeVideoLesson.videoUrl ? (
            <div className="relative">
              <VideoPlayer
                videoUrl={activeVideoLesson.videoUrl}
                lessonId={activeVideoLesson.id}
                lessonTitle={activeVideoLesson.title}
                durationMinutes={activeVideoLesson.durationMinutes}
                onComplete={() => handleVideoComplete(activeVideoLesson.id)}
                isCompleted={isLessonCompleted(activeVideoLesson.id)}
                courseId={course.id}
                readinessBonus={activeVideoLesson.readinessBonus || 5}
              />
              <div className="p-4 bg-[#1e3a5f] text-white">
                <p className="text-sm text-white/70">Now Playing</p>
                <h3 className="font-semibold">{activeVideoLesson.title}</h3>
                <p className="text-sm text-white/80 mt-1">{activeVideoLesson.description}</p>
              </div>
            </div>
          ) : (
            <div className="relative h-48">
              <img
                src={course.thumbnailUrl}
                alt={course.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              
              {/* Free badge */}
              {course.isFree && (
                <div className="absolute top-4 right-4">
                  <span className="bg-emerald-500 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg">
                    FREE
                  </span>
                </div>
              )}
              
              <div className="absolute bottom-6 left-6 right-6">
                <h1 className="text-2xl font-bold text-white mb-2">{course.title}</h1>
                <div className="flex items-center space-x-4 text-white/80 text-sm">
                  <span className="flex items-center">
                    <ClockIcon size={14} className="mr-1" />
                    {course.durationMinutes} minutes
                  </span>
                  <span className="flex items-center">
                    <BookIcon size={14} className="mr-1" />
                    {course.lessons?.length || 0} lessons
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="p-6">
            <p className="text-gray-600 mb-4">{course.description}</p>
            <div className="flex items-center space-x-3">
              <ProgressBar progress={calculatedProgress} className="flex-1" />
              <span className="text-sm font-medium text-[#1e3a5f]">{calculatedProgress}%</span>
            </div>
          </div>
        </div>

        {/* Lessons list */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-xl font-bold text-[#1e3a5f]">Course Content</h2>
            <p className="text-sm text-gray-500 mt-1">
              Watch each video to 90% to mark it complete and earn readiness points
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {course.lessons?.map((lesson, index) => {
              const completed = isLessonCompleted(lesson.id);
              return (
                <div
                  key={lesson.id}
                  onClick={() => {
                    if (lesson.contentType === 'video' && lesson.videoUrl) {
                      setActiveVideoLesson(lesson);
                    } else {
                      onSelectLesson(lesson);
                    }
                  }}
                  className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center ${
                    activeVideoLesson?.id === lesson.id ? 'bg-[#1e3a5f]/5 border-l-4 border-[#1e3a5f]' : ''
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${
                    completed
                      ? 'bg-emerald-100 text-emerald-600'
                      : activeVideoLesson?.id === lesson.id
                      ? 'bg-[#1e3a5f] text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    {completed ? (
                      <CheckCircleIcon size={20} />
                    ) : lesson.contentType === 'video' ? (
                      <PlayIcon size={16} />
                    ) : (
                      <span className="text-sm font-medium">{index + 1}</span>
                    )}
                  </div>

                  <div className="flex-1">
                    <h3 className="font-medium text-[#1e3a5f]">{lesson.title}</h3>
                    <p className="text-sm text-gray-500">{lesson.description}</p>
                  </div>

                  <div className="flex items-center space-x-3 text-sm text-gray-400">
                    {lesson.readinessBonus && (
                      <span className="text-[#c4785a] text-xs bg-[#c4785a]/10 px-2 py-1 rounded-full">
                        +{lesson.readinessBonus} pts
                      </span>
                    )}
                    <span className="flex items-center">
                      {lesson.contentType === 'video' && <PlayIcon size={14} className="mr-1" />}
                      {lesson.contentType === 'reflection' && <BookIcon size={14} className="mr-1" />}
                      {lesson.durationMinutes} min
                    </span>
                    <ChevronRightIcon size={20} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Lesson View (for non-video content)
const LessonView: React.FC<{
  lesson: Lesson;
  course: Course;
  onBack: () => void;
  onComplete: () => void;
  saveReflection: (lessonId: string, courseId: string, prompt: string, response: string) => Promise<void>;
}> = ({ lesson, course, onBack, onComplete, saveReflection }) => {
  const { user, updateUser } = useAppStore();
  const { saveLessonProgress, isLessonCompleted } = useCourseProgress();
  const [reflection, setReflection] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const completed = isLessonCompleted(lesson.id);

  const handleComplete = async () => {
    setIsCompleting(true);
    
    // Save reflection if provided
    if (reflection.trim()) {
      for (const prompt of lesson.reflectionPrompts) {
        await saveReflection(lesson.id, course.id, prompt, reflection);
      }
    }
    
    // Mark lesson as complete in database
    await saveLessonProgress(
      lesson.id,
      course.id,
      100,
      0,
      lesson.durationMinutes * 60,
      true,
      lesson.readinessBonus || 0
    );
    
    // Update readiness score locally
    if (user && lesson.readinessBonus) {
      const newScore = Math.min(100, (user.readinessScore || 0) + lesson.readinessBonus);
      updateUser({ readinessScore: newScore });
    }
    
    setIsSaved(true);
    setIsCompleting(false);
    onComplete();
  };

  return (
    <div className="min-h-screen bg-[#faf6f1] py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" onClick={onBack} className="mb-6">
          ← Back to {course.title}
        </Button>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Lesson header */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-[#c4785a] uppercase tracking-wide">
                {lesson.contentType}
              </span>
              {course.isFree && (
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  FREE
                </span>
              )}
              {lesson.readinessBonus && (
                <span className="text-xs font-medium text-[#c4785a] bg-[#c4785a]/10 px-2 py-0.5 rounded-full">
                  +{lesson.readinessBonus} Readiness Points
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-[#1e3a5f] mt-2">{lesson.title}</h1>
            <p className="text-gray-600 mt-2">{lesson.description}</p>
          </div>

          {/* Content area */}
          <div className="p-6">
            {lesson.contentType === 'video' && lesson.videoUrl && (
              <div className="mb-6">
                <VideoPlayer
                  videoUrl={lesson.videoUrl}
                  lessonId={lesson.id}
                  lessonTitle={lesson.title}
                  durationMinutes={lesson.durationMinutes}
                  onComplete={onComplete}
                  isCompleted={completed}
                  courseId={course.id}
                  readinessBonus={lesson.readinessBonus || 5}
                />
              </div>
            )}

            {lesson.contentType === 'article' && (
              <div className="prose max-w-none mb-6">
                <p className="text-gray-600 leading-relaxed">
                  This lesson explores the importance of {lesson.title.toLowerCase()} in building 
                  a strong foundation for marriage. Understanding these principles will help you 
                  develop the skills needed for a lasting, fulfilling relationship.
                </p>
                <p className="text-gray-600 leading-relaxed mt-4">
                  Take your time to reflect on how these concepts apply to your own life and 
                  relationships. The reflection prompts below will help guide your thinking.
                </p>
              </div>
            )}

            {/* Reflection section */}
            <div className="bg-[#faf6f1] rounded-xl p-6">
              <h3 className="font-semibold text-[#1e3a5f] mb-4">Reflection</h3>
              {lesson.reflectionPrompts.map((prompt, index) => (
                <p key={index} className="text-gray-600 mb-4 italic">"{prompt}"</p>
              ))}
              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="Write your reflections here... (saved to your account)"
                rows={6}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent resize-none"
              />
              {isSaved && (
                <p className="text-sm text-emerald-600 mt-2 flex items-center">
                  <CheckCircleIcon size={14} className="mr-1" />
                  Reflection saved to your account
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-100 flex justify-between items-center">
            <p className="text-sm text-gray-500">
              {completed ? 'Completed' : 'Mark as complete when finished'}
            </p>
            <Button
              onClick={handleComplete}
              isLoading={isCompleting}
              disabled={completed}
            >
              {completed ? 'Completed' : 'Mark Complete'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
