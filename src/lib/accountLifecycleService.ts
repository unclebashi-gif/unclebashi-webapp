import { supabase } from '@/lib/supabase';
import type {
  AccountDeletionReadiness,
  AccountLifecycleStatus,
  AccountStatus,
  MatchmakingDataRemovalResult,
} from '@/types/accountLifecycle';

const firstRow = <T,>(data: unknown, label: string): T => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new Error(`The server did not return ${label}.`);
  return row as T;
};

export const getAccountLifecycleStatus = async (): Promise<AccountLifecycleStatus> => {
  const { data, error } = await supabase.rpc('get_account_lifecycle_status');
  if (error) throw new Error(error.message || 'Could not load account status.');
  return firstRow<AccountLifecycleStatus>(data, 'account status');
};

export const getAccountDeletionReadiness = async (): Promise<AccountDeletionReadiness> => {
  const { data, error } = await supabase.rpc('get_account_deletion_readiness');
  if (error) throw new Error(error.message || 'Could not check account deletion readiness.');
  return firstRow<AccountDeletionReadiness>(data, 'deletion readiness');
};

export const deactivateMyAccount = async (): Promise<AccountStatus> => {
  const { data, error } = await supabase.rpc('deactivate_my_account');
  if (error) throw new Error(error.message || 'Could not deactivate this account.');
  if (!['active', 'deactivated', 'deletion_pending'].includes(data)) {
    throw new Error('The server did not confirm the account status.');
  }
  return data as AccountStatus;
};

export const reactivateMyAccount = async (): Promise<AccountStatus> => {
  const { data, error } = await supabase.rpc('reactivate_my_account');
  if (error) throw new Error(error.message || 'Could not reactivate this account.');
  if (!['active', 'deactivated', 'deletion_pending'].includes(data)) {
    throw new Error('The server did not confirm the account status.');
  }
  return data as AccountStatus;
};

export const deleteMyMatchmakingData = async (): Promise<MatchmakingDataRemovalResult> => {
  const { data, error } = await supabase.rpc('delete_my_matchmaking_data');
  if (error) throw new Error(error.message || 'Could not remove Matchmaking participation.');
  return firstRow<MatchmakingDataRemovalResult>(data, 'Matchmaking removal result');
};
