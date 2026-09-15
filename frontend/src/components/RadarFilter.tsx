/**
 * RadarFilter — Sélection multi-radar avec checkboxes.
 *
 * Affiche la liste de tous les radars disponibles avec des cases à cocher.
 * Permet de tout cocher / tout décocher rapidement.
 */

interface RadarFilterProps {
  /** Liste de tous les radars disponibles (chargée depuis l'API) */
  availableRadars: string[]
  /** Radars actuellement cochés */
  selectedRadars: string[]
  onChange: (selected: string[]) => void
  isLoading: boolean
}

export function RadarFilter({
  availableRadars,
  selectedRadars,
  onChange,
  isLoading,
}: RadarFilterProps) {
  const selectedSet = new Set(selectedRadars)

  const toggleRadar = (radar: string) => {
    if (selectedSet.has(radar)) {
      onChange(selectedRadars.filter((r) => r !== radar))
    } else {
      onChange([...selectedRadars, radar])
    }
  }

  const selectAll = () => onChange([...availableRadars])
  const deselectAll = () => onChange([])

  return (
    <div className="space-y-2">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">Radars</span>
          {availableRadars.length > 0 && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              selectedRadars.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}>
              {selectedRadars.length}/{availableRadars.length}
            </span>
          )}
        </div>
        {availableRadars.length > 0 && (
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={selectAll}
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
            >
              Tout
            </button>
            <span className="text-slate-600">|</span>
            <button
              type="button"
              onClick={deselectAll}
              className="text-slate-400 hover:text-slate-200 font-semibold transition-colors"
            >
              Aucun
            </button>
          </div>
        )}
      </div>

      {/* Corps */}
      {isLoading ? (
        /* Skeleton loader */
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-7 bg-slate-700/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : availableRadars.length === 0 ? (
        <p className="text-slate-500 text-xs italic">Aucun radar en base</p>
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
          {availableRadars.map((radar) => {
            const isChecked = selectedSet.has(radar)
            return (
              <label
                key={radar}
                className="flex items-center gap-2.5 hover:bg-slate-700/50 rounded-lg px-2 py-1.5 cursor-pointer transition-colors group"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleRadar(radar)}
                  className="w-3.5 h-3.5 rounded text-emerald-600 bg-slate-900 border-slate-600
                    focus:ring-emerald-500 focus:ring-offset-slate-800 focus:ring-2
                    cursor-pointer transition accent-emerald-500"
                />
                <span className="text-sm font-mono text-slate-300 group-hover:text-slate-100 transition-colors">
                  {radar}
                </span>
                {isChecked && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
