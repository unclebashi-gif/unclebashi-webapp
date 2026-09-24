import React from 'react';

interface ProgressBarProps {
  progress: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'success';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  showLabel = false,
  size = 'md',
  color = 'primary',
  className = '',
}) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  const sizes = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  const colors = {
    primary: 'bg-[#1e3a5f]',
    secondary: 'bg-[#c4785a]',
    success: 'bg-emerald-500',
  };

  return (
    <div className={`w-full ${className}`}>
      <div className={`w-full bg-gray-200 rounded-full ${sizes[size]} overflow-hidden`}>
        <div
          className={`${sizes[size]} ${colors[color]} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      {showLabel && (
        <p className="mt-1 text-sm text-gray-600 text-right">{Math.round(clampedProgress)}%</p>
      )}
    </div>
  );
};

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
}

export const StepProgress: React.FC<StepProgressProps> = ({
  currentStep,
  totalSteps,
  labels,
}) => {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <React.Fragment key={index}>
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ${
                  index < currentStep
                    ? 'bg-[#1e3a5f] text-white'
                    : index === currentStep
                    ? 'bg-[#c4785a] text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {index < currentStep ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              {labels && labels[index] && (
                <span className="mt-2 text-xs text-gray-500 text-center max-w-[60px] hidden sm:block">
                  {labels[index]}
                </span>
              )}
            </div>

            {/* Connector line */}
            {index < totalSteps - 1 && (
              <div
                className={`flex-1 h-1 mx-2 rounded transition-all duration-300 ${
                  index < currentStep ? 'bg-[#1e3a5f]' : 'bg-gray-200'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
