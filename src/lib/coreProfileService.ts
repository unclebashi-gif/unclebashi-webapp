import { supabase } from '@/lib/supabase';

export interface CoreProfileDraft {
  display_name: string;
  nationality_country_code: string;
  country_of_origin_code: string;
  country_code: string;
  city: string;
  primary_language: string;
  other_languages: string[];
  legal_marital_status: string;
  relationship_situation: string;
}

export const saveCoreProfile = async (draft: CoreProfileDraft): Promise<CoreProfileDraft> => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify your session: ${authError.message}`);
  if (!authData.user) throw new Error('Sign in to update your profile.');

  const values: CoreProfileDraft = {
    display_name: draft.display_name.trim(),
    nationality_country_code: draft.nationality_country_code,
    country_of_origin_code: draft.country_of_origin_code,
    country_code: draft.country_code,
    city: draft.city.trim(),
    primary_language: draft.primary_language.trim(),
    other_languages: draft.other_languages.map((value) => value.trim()).filter(Boolean),
    legal_marital_status: draft.legal_marital_status,
    relationship_situation: draft.relationship_situation,
  };

  const { data, error } = await supabase
    .from('users')
    .update(values)
    .eq('id', authData.user.id)
    .select('display_name,nationality_country_code,country_of_origin_code,country_code,city,primary_language,other_languages,legal_marital_status,relationship_situation')
    .maybeSingle();

  if (error) throw new Error(`Could not save your core profile: ${error.message}`);
  if (!data) throw new Error('Your core profile was not updated.');
  return data as CoreProfileDraft;
};
