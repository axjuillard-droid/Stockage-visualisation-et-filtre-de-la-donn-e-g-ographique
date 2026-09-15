/**
 * ZoneManualForm — Formulaire de saisie manuelle d'une zone rectangulaire.
 *
 * À la validation, la zone est ajoutée au hook useMapZones et apparaît
 * sur la carte exactement comme si elle avait été dessinée à la souris.
 * Validation : lat_min < lat_max et lon_min < lon_max.
 */

import { useState } from 'react'
import type { ZoneRectangle } from '../types'

interface ZoneManualFormProps {
  /** Appelé avec la zone validée pour l'ajouter au state global */
  onZoneAdd: (zone: ZoneRectangle) => void
}

interface FormFields {
  nom: string
  lat_min: string
  lat_max: string
  lon_min: string
  lon_max: string
}

const EMPTY: FormFields = { nom: '', lat_min: '', lat_max: '', lon_min: '', lon_max: '' }

/**
 * Formulaire de saisie manuelle d'une zone rectangulaire.
 * Résultat identique à un dessin Leaflet.draw — zone ajoutée à la liste active.
 */
export function ZoneManualForm({ onZoneAdd }: ZoneManualFormProps) {
  const [fields, setFields] = useState<FormFields>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const set = (key: keyof FormFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((prev) => ({ ...prev, [key]: e.target.value }))
    setError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const nums = {
      lat_min: parseFloat(fields.lat_min),
      lat_max: parseFloat(fields.lat_max),
      lon_min: parseFloat(fields.lon_min),
      lon_max: parseFloat(fields.lon_max),
    }

    // Validation numérique
    if (Object.values(nums).some(isNaN)) {
      setError('Toutes les valeurs doivent être des nombres valides.')
      return
    }

    // Validation des plages
    if (nums.lat_min < -90 || nums.lat_max > 90) {
      setError('Les latitudes doivent être comprises entre -90 et 90.')
      return
    }
    if (nums.lon_min < -180 || nums.lon_max > 180) {
      setError('Les longitudes doivent être comprises entre -180 et 180.')
      return
    }

    // Auto-correction si inversé
    const zone: ZoneRectangle = {
      type: 'rectangle',
      nom: fields.nom.trim() || undefined,
      lat_min: Math.min(nums.lat_min, nums.lat_max),
      lat_max: Math.max(nums.lat_min, nums.lat_max),
      lon_min: Math.min(nums.lon_min, nums.lon_max),
      lon_max: Math.max(nums.lon_min, nums.lon_max),
    }

    if (zone.lat_min === zone.lat_max || zone.lon_min === zone.lon_max) {
      setError('La zone doit avoir une surface non nulle.')
      return
    }

    onZoneAdd(zone)
    setFields(EMPTY)
    setIsOpen(false)
    setError(null)
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      {/* Toggle header */}
      <button
        id="btn-toggle-manual-form"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors"
      >
        <span className="flex items-center gap-2 font-medium">
          <span>✏️</span>
          Saisie manuelle de zone
        </span>
        <span className={`text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {/* Formulaire accordéon */}
      {isOpen && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-3 border-t border-slate-700">
          <p className="text-xs text-slate-500 pt-3">
            Coordonnées WGS84 — la zone sera ajoutée aux zones actives.
          </p>

          <label className="block">
            <span className="text-xs text-slate-400 block mb-1">Nom de la zone (optionnel)</span>
            <input
              id="input-zone-nom"
              type="text"
              placeholder="Ex: Zone d'attente Paris"
              value={fields.nom}
              onChange={set('nom')}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2.5 py-1.5 text-slate-200 text-sm
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-500"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: 'lat_min', label: 'Lat min (Sud)', placeholder: '43.0' },
                { key: 'lat_max', label: 'Lat max (Nord)', placeholder: '49.0' },
                { key: 'lon_min', label: 'Lon min (Ouest)', placeholder: '-2.0' },
                { key: 'lon_max', label: 'Lon max (Est)', placeholder: '8.0' },
              ] as { key: keyof FormFields; label: string; placeholder: string }[]
            ).map(({ key, label, placeholder }) => (
              <label key={key} className="block">
                <span className="text-xs text-slate-400 block mb-1">{label}</span>
                <input
                  id={`input-zone-${key}`}
                  type="number"
                  step="any"
                  placeholder={placeholder}
                  value={fields[key]}
                  onChange={set(key)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2.5 py-1.5 text-slate-200 text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600"
                />
              </label>
            ))}
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-950/30 border border-red-800 rounded p-2">
              {error}
            </p>
          )}

          <button
            id="btn-add-manual-zone"
            type="submit"
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors active:scale-[0.98]"
          >
            Ajouter la zone
          </button>
        </form>
      )}
    </div>
  )
}
