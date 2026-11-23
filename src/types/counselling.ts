export type CounsellingSupportType =
  | 'couples_counselling'
  | 'family_counselling'
  | 'relationship_counselling'
  | 'individual_relationship_support'
  | 'crisis_support'
  | 'not_sure';

export type CounsellingContactMethod = 'email' | 'phone' | 'either';
export type CounsellingPartnerParticipation = 'yes' | 'no' | 'not_applicable' | 'not_sure';
export type CounsellingUrgency = 'routine' | 'soon' | 'urgent' | 'immediate_danger';
export type CounsellingRequestStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'contacted'
  | 'referred'
  | 'closed'
  | 'withdrawn';

export interface CounsellingRequest {
  id: string;
  user_id: string;
  request_version: number;
  support_type: CounsellingSupportType | null;
  preferred_contact_method: CounsellingContactMethod | null;
  contact_phone: string | null;
  preferred_time_notes: string | null;
  country_code: string | null;
  brief_reason: string | null;
  partner_participation: CounsellingPartnerParticipation | null;
  urgency_self_description: CounsellingUrgency | null;
  consent_to_contact: boolean;
  status: CounsellingRequestStatus;
  submitted_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CounsellingRequestDraft = Pick<CounsellingRequest,
  | 'support_type'
  | 'preferred_contact_method'
  | 'contact_phone'
  | 'preferred_time_notes'
  | 'country_code'
  | 'brief_reason'
  | 'partner_participation'
  | 'urgency_self_description'
  | 'consent_to_contact'
>;

export interface AdminCounsellingRequest {
  request_id: string;
  user_id: string;
  display_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  country_code: string | null;
  support_type: CounsellingSupportType | null;
  urgency_self_description: CounsellingUrgency | null;
  preferred_contact_method: CounsellingContactMethod | null;
  submitted_at: string;
  brief_reason: string | null;
  status: CounsellingRequestStatus;
}
