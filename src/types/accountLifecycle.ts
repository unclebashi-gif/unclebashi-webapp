export type AccountStatus = 'active' | 'deactivated' | 'deletion_pending';

export interface AccountLifecycleStatus {
  account_status: AccountStatus;
  active_journey_count: number;
}

export interface AccountDeletionReadiness {
  can_hard_delete: boolean;
  has_payment_history: boolean;
  has_retained_operational_records: boolean;
  active_journey_count: number;
  retained_record_categories: string[];
  blocking_reasons: string[];
}

export interface MatchmakingDataRemovalResult {
  profile_removed: boolean;
  photos_removed: number;
  journey_status: string;
}
