import * as React from "react"

import { cn } from "@/lib/utils"

type CardPadding = "none" | "sm" | "md" | "lg"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  padding?: CardPadding
}

const cardPaddings: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = "", onClick, hover = false, padding = "md", ...props }, ref) => (
    <div
      ref={ref}
      className={`bg-white rounded-xl shadow-sm border border-gray-100 ${cardPaddings[padding]} ${
        hover ? "hover:shadow-md hover:border-gray-200 transition-all duration-200" : ""
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  ),
)
Card.displayName = "Card"

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  onClick?: () => void
  locked?: boolean
  progress?: number
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description, onClick, locked = false, progress }) => (
  <div
    className={`relative bg-white rounded-xl shadow-sm border border-gray-100 p-6 transition-all duration-200 ${
      locked ? "opacity-60" : "hover:shadow-md hover:border-gray-200 cursor-pointer"
    }`}
    onClick={locked ? undefined : onClick}
  >
    {locked && (
      <div className="absolute top-4 right-4">
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
    )}
    <div className="w-12 h-12 rounded-lg bg-[#faf6f1] flex items-center justify-center text-[#c4785a] mb-4">{icon}</div>
    <h3 className="text-lg font-semibold text-[#1e3a5f] mb-2">{title}</h3>
    <p className="text-gray-600 text-sm">{description}</p>
    {progress !== undefined && (
      <div className="mt-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Progress</span><span>{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div className="bg-[#c4785a] h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>
    )}
  </div>
)

interface ProfileCardProps {
  image: string
  name: string
  age?: number
  location?: string
  values?: string
  intentions?: string
  readinessScore?: number
  onViewProfile?: () => void
  onRequestIntro?: () => void
  blurred?: boolean
}

const ProfileCard: React.FC<ProfileCardProps> = ({
  image, name, age, location, values, intentions, readinessScore, onViewProfile, onRequestIntro, blurred = false,
}) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-200">
    <div className="relative">
      <img src={image} alt={name} className={`w-full h-48 object-cover ${blurred ? "blur-sm" : ""}`} />
      {readinessScore !== undefined && (
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full text-xs font-medium text-[#1e3a5f]">
          {readinessScore}% Ready
        </div>
      )}
    </div>
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className={`text-lg font-semibold text-[#1e3a5f] ${blurred ? "blur-sm" : ""}`}>
          {name}{age ? `, ${age}` : ""}
        </h3>
      </div>
      {location && <p className="text-sm text-gray-500 mb-3">{location}</p>}
      {values && (
        <div className="mb-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Values</p>
          <p className="text-sm text-gray-700">{values}</p>
        </div>
      )}
      {intentions && (
        <div className="mb-4">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Intentions</p>
          <p className="text-sm text-gray-700">{intentions}</p>
        </div>
      )}
      <div className="flex gap-2">
        {onViewProfile && (
          <button onClick={onViewProfile} className="flex-1 px-3 py-2 text-sm font-medium text-[#1e3a5f] border border-[#1e3a5f] rounded-lg hover:bg-[#1e3a5f] hover:text-white transition-colors">
            View Profile
          </button>
        )}
        {onRequestIntro && (
          <button onClick={onRequestIntro} className="flex-1 px-3 py-2 text-sm font-medium text-white bg-[#c4785a] rounded-lg hover:bg-[#d4917a] transition-colors">
            Request Intro
          </button>
        )}
      </div>
    </div>
  </div>
)

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />,
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight text-foreground", className)} {...props} />,
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />,
)
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
)
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />,
)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, FeatureCard, ProfileCard }
