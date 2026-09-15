/**
 * TimeRangeSlider — Double slider temporel à fenêtre glissante (Rolling Viewport).
 *
 * Calcule dynamiquement ses bornes pour centrer la sélection à 50% de la largeur,
 * laissant 25% de marge à gauche (le passé) et 25% à droite (le futur) pour
 * permettre un défilement infini.
 *
 * Pour éviter les sauts de poignées pendant le glissement, l'échelle reste stable
 * tant que la souris est enfoncée. Les filtres sont propagés au relâchement du clic.
 */

import { useCallback, useRef, useState } from 'react'

interface TimeRangeSliderProps {
  /** Valeur courante borne basse (timestamp) */
  valueMin: number
  /** Valeur courante borne haute (timestamp) */
  valueMax: number
  onChange: (min: number, max: number) => void
  onCommit: (min: number, max: number) => void
}

/** Formate un timestamp Unix (ms) en chaîne lisible fr-FR UTC. */
function formatTime(val: number): string {
  try {
    return new Date(val).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    })
  } catch {
    return '—'
  }
}

export function TimeRangeSlider({
  valueMin,
  valueMax,
  onChange,
  onCommit,
}: TimeRangeSliderProps) {
  const rangeRef = useRef<HTMLDivElement>(null)
  const [isMinActive, setIsMinActive] = useState(true)

  // 1. États locaux pour un déplacement fluide en temps réel sans "sauts"
  const [localMin, setLocalMin] = useState(valueMin)
  const [localMax, setLocalMax] = useState(valueMax)
  const [prevProps, setPrevProps] = useState({ valueMin, valueMax })

  // Synchronisation de l'état local avec les props lorsqu'elles changent
  if (valueMin !== prevProps.valueMin || valueMax !== prevProps.valueMax) {
    setLocalMin(valueMin)
    setLocalMax(valueMax)
    setPrevProps({ valueMin, valueMax })
  }

  // 2. Calcul des bornes du slider basé sur la sélection validée (props stables)
  // Durée de la sélection courante (minimum 1 minute)
  const duration = Math.max(60 * 1000, valueMax - valueMin)
  const sliderMin = valueMin - 0.5 * duration // Marge de 25% à gauche
  const sliderMax = valueMax + 0.5 * duration // Marge de 25% à droite

  // Résolution dynamique du curseur (1000 divisions) pour garantir la fluidité
  const step = Math.max(1000, Math.floor(duration / 1000))

  // Calcule le pourcentage de placement par rapport aux bornes du slider
  const pct = useCallback(
    (val: number) => (sliderMax === sliderMin ? 0 : ((val - sliderMin) / (sliderMax - sliderMin)) * 100),
    [sliderMin, sliderMax],
  )

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    // Empêche le croisement (min au moins à une division de max)
    const newMin = Math.min(val, localMax - step)
    setLocalMin(newMin)
    onChange(newMin, localMax)
  }

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    // Empêche le croisement (max au moins à une division de min)
    const newMax = Math.max(val, localMin + step)
    setLocalMax(newMax)
    onChange(localMin, newMax)
  }

  // Propagation finale de la sélection au relâchement de la poignée
  const handleCommit = () => {
    onCommit(localMin, localMax)
  }

  const pctMin = pct(localMin)
  const pctMax = pct(localMax)

  return (
    <div className="space-y-3 font-sans">
      {/* Affichage des valeurs courantes (mise à jour en direct lors du glissement) */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono bg-slate-700 border border-slate-600 px-2 py-1.5 rounded-md text-emerald-300 font-semibold shadow-inner">
          {formatTime(localMin)}
        </span>
        <span className="text-slate-500 text-[10px] mx-1">→</span>
        <span className="font-mono bg-slate-700 border border-slate-600 px-2 py-1.5 rounded-md text-emerald-300 font-semibold shadow-inner">
          {formatTime(localMax)}
        </span>
      </div>

      {/* Frise / Track + poignées superposées */}
      <div
        ref={rangeRef}
        className="relative h-6 flex items-center select-none"
        onMouseMove={(e) => {
          if (!rangeRef.current) return
          const rect = rangeRef.current.getBoundingClientRect()
          const clickX = e.clientX - rect.left
          const width = rect.width
          const pctClick = (clickX / width) * 100

          const pctMinVal = pct(localMin)
          const pctMaxVal = pct(localMax)

          const isCloserToMin = Math.abs(pctClick - pctMinVal) < Math.abs(pctClick - pctMaxVal)
          if (isCloserToMin !== isMinActive) {
            setIsMinActive(isCloserToMin)
          }
        }}
      >
        {/* Rail d'arrière-plan grisé */}
        <div className="absolute left-0 right-0 h-1.5 bg-slate-700 rounded-full" />

        {/* Zone active colorée (représente toujours 50% de la largeur au repos) */}
        <div
          className="absolute h-1.5 bg-emerald-500 rounded-full pointer-events-none"
          style={{ left: `${pctMin}%`, right: `${100 - pctMax}%` }}
        />

        {/* Input poignée de gauche */}
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={step}
          value={localMin}
          onChange={handleMinChange}
          onMouseUp={handleCommit}
          onTouchEnd={handleCommit}
          className="absolute w-full h-1.5 appearance-none bg-transparent cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-emerald-500
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-webkit-slider-thumb]:transition-transform
            [&::-moz-range-thumb]:w-4
            [&::-moz-range-thumb]:h-4
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white
            [&::-moz-range-thumb]:border-2
            [&::-moz-range-thumb]:border-emerald-500"
          style={{ zIndex: isMinActive ? 5 : 3 }}
        />

        {/* Input poignée de droite */}
        <input
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={step}
          value={localMax}
          onChange={handleMaxChange}
          onMouseUp={handleCommit}
          onTouchEnd={handleCommit}
          className="absolute w-full h-1.5 appearance-none bg-transparent cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-emerald-500
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-webkit-slider-thumb]:transition-transform
            [&::-moz-range-thumb]:w-4
            [&::-moz-range-thumb]:h-4
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white
            [&::-moz-range-thumb]:border-2
            [&::-moz-range-thumb]:border-emerald-500"
          style={{ zIndex: !isMinActive ? 5 : 3 }}
        />
      </div>

      {/* Légende indiquant les bornes de navigation de la vue courante */}
      <div className="flex justify-between text-[9px] text-slate-500 font-mono select-none">
        <span>{formatTime(sliderMin)}</span>
        <span className="text-[8px] text-slate-600 font-sans">← Past (25%) | Future (25%) →</span>
        <span>{formatTime(sliderMax)}</span>
      </div>
    </div>
  )
}
