/** Boy or girl, kept on the child's record. Optional: tap the chosen one again to clear it. */
export function GenderChoice({ value, onChange }: { value: 'boy' | 'girl' | null; onChange: (v: 'boy' | 'girl' | null) => void }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 px-0.5 text-small font-bold text-ink-2">Boy or girl <span className="font-semibold text-ink-2">(optional)</span></legend>
      <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Boy or girl">
        {(['boy', 'girl'] as const).map((g) => (
          <button key={g} type="button" role="radio" aria-checked={value === g} onClick={() => onChange(value === g ? null : g)}
            className="choice flex h-12 items-center justify-center px-3 text-h4">
            {g === 'boy' ? 'Boy' : 'Girl'}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
