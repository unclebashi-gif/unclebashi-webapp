import { Check, ChevronDown, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MATCHMAKING_COUNTRIES } from '@/types/matchmaking';

type Country = (typeof MATCHMAKING_COUNTRIES)[number];

export function CountryMultiSelect({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const byCode = useMemo(() => new Map<string, Country>(MATCHMAKING_COUNTRIES.map(country => [country.code, country])), []);
  const selected = value.map(code => byCode.get(code) ?? { code, country: code, nationality: code });
  const toggle = (code: string) => onChange(value.includes(code) ? value.filter(item => item !== code) : [...value, code]);
  return <div className="min-w-0">
    <span className="text-sm text-gray-700">{label}</span>
    <div className="mt-2 flex flex-wrap gap-2">
      {selected.map(country => <span key={country.code} className="inline-flex items-center gap-1 rounded-full bg-[#eef2f5] px-3 py-1 text-sm text-[#1e3a5f]">{country.nationality} ({country.code})<button type="button" aria-label={`Remove ${country.country}`} onClick={() => toggle(country.code)} className="rounded-full p-0.5 hover:bg-black/10"><X size={14} /></button></span>)}
      <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="rounded-full"><span aria-hidden="true">+</span> Add <ChevronDown size={14} className="ml-1" /></Button></PopoverTrigger>
        <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0"><Command><CommandInput placeholder="Search countries…" aria-label={`Search ${label.toLowerCase()}`} /><CommandList><CommandEmpty>No country found.</CommandEmpty>
          {MATCHMAKING_COUNTRIES.map(country => <CommandItem key={country.code} value={`${country.country} ${country.nationality} ${country.code}`} onSelect={() => toggle(country.code)}><span className="flex-1">{country.nationality} ({country.code})</span>{value.includes(country.code) && <Check size={16} aria-label="Selected" />}</CommandItem>)}
        </CommandList></Command></PopoverContent>
      </Popover>
    </div>
  </div>;
}

export function TokenInput({ label, value, onChange, placeholder = 'Type and press Enter' }: { label: string; value: string[]; onChange: (value: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const addTokens = (raw: string) => {
    const tokens = raw.split(/[,;\n]/).map(token => token.trim()).filter(Boolean);
    if (!tokens.length) return;
    const seen = new Set(value.map(token => token.toLocaleLowerCase()));
    onChange([...value, ...tokens.filter(token => { const key = token.toLocaleLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })]);
    setDraft('');
  };
  return <div><label className="block text-sm text-gray-700">{label}<input value={draft} placeholder={placeholder} onChange={event => { const next = event.target.value; if (/[,;\n]/.test(next)) addTokens(next); else setDraft(next); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTokens(draft); } if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1)); }} onBlur={() => addTokens(draft)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2" /></label>
    {value.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{value.map((token, index) => <span key={`${token.toLowerCase()}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-[#eef2f5] px-3 py-1 text-sm text-[#1e3a5f]">{token}<button type="button" aria-label={`Remove ${token}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} className="rounded-full p-0.5 hover:bg-black/10"><X size={14}/></button></span>)}</div>}
  </div>;
}

export function PreferenceMode({ value, onChange }: { value: string; onChange: (value: 'required' | 'preferred' | 'open') => void }) {
  const labels = { required: 'Must match', preferred: 'Prefer', open: 'No preference' } as const;
  return <div className="grid grid-cols-3 rounded-lg bg-gray-100 p-1" role="group" aria-label="How important is this preference?">{(['required', 'preferred', 'open'] as const).map(mode => <button type="button" key={mode} aria-pressed={value === mode} onClick={() => onChange(mode)} className={`rounded-md px-1.5 py-2 text-[11px] leading-tight sm:px-2 sm:text-sm ${value === mode ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{labels[mode]}</button>)}</div>;
}

export function ChoicePreference({
  label,
  value,
  options,
  onChange,
  mode,
  onModeChange,
  multiple = false,
}: {
  label: string;
  value: string[];
  options: Array<{ label: string; value: string }>;
  onChange: (value: string[]) => void;
  mode: string;
  onModeChange: (value: 'required' | 'preferred' | 'open') => void;
  multiple?: boolean;
}) {
  const toggle = (choice: string) => {
    if (multiple) onChange(value.includes(choice) ? value.filter(item => item !== choice) : [...value, choice]);
    else onChange(value.includes(choice) ? [] : [choice]);
  };
  return <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_250px] sm:items-end">
    <fieldset className="min-w-0"><legend className="mb-2 text-sm text-gray-700">{label}</legend><div className="flex flex-wrap gap-2">{options.map(option => <button type="button" key={option.value} aria-pressed={value.includes(option.value)} onClick={() => toggle(option.value)} className={`rounded-full border px-3 py-2 text-sm ${value.includes(option.value) ? 'border-[#1e3a5f] bg-[#eef2f5] text-[#1e3a5f]' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`}>{option.label}</button>)}</div></fieldset>
    <PreferenceMode value={mode} onChange={onModeChange} />
  </div>;
}
