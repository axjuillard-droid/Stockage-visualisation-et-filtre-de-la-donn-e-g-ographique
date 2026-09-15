/**
 * ZoneStatsPopup — Popup Leaflet affichant les statistiques agrégées
 * des avions capturés dans une zone géographique dessinée.
 */

import { Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { ZoneStats, Zone } from '../types'

interface ZoneStatsPopupProps {
  zone: Zone
  stats: ZoneStats | null
  isLoading: boolean
  error: string | null
  /** Position géographique du popup (centre de la zone) */
  position: [number, number]
  onClose: () => void
  onAnalyze: (stats: ZoneStats) => void
}

/** Formate une date ISO en chaîne lisible (fr-FR). */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

/** Formate un nombre en pieds. */
function formatFt(val: number | null): string {
  if (val === null || val === undefined) return '—'
  return `${Math.round(val).toLocaleString('fr-FR')} ft`
}

export function ZoneStatsPopup({
  zone,
  stats,
  isLoading,
  error,
  position,
  onClose,
  onAnalyze,
}: ZoneStatsPopupProps) {
  const map = useMap()

  const handleAnalyze = () => {
    if (!stats) return
    if (zone.type === 'rectangle') {
      const bounds = L.latLngBounds(
        [zone.lat_min, zone.lon_min],
        [zone.lat_max, zone.lon_max]
      )
      map.fitBounds(bounds)
    } else if (zone.type === 'cercle') {
      const circle = L.circle([zone.lat, zone.lon], { radius: zone.rayon_km * 1000 })
      map.fitBounds(circle.getBounds())
    }
    onAnalyze(stats)
  }

  return (
    <Popup
      position={position}
      eventHandlers={{ remove: onClose }}
      minWidth={260}
      maxWidth={320}
      className="zone-stats-popup"
    >
      <div className="font-sans text-slate-800 min-w-[240px]">
        {/* Header */}
        <div className="font-bold text-sm px-3 py-2 rounded-t-lg bg-slate-800 text-white mb-2 flex items-center gap-2">
          <span>📊</span>
          <span>Statistiques de la zone</span>
        </div>

        {/* État chargement */}
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <div className="w-6 h-6 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
          </div>
        )}

        {/* État erreur */}
        {!isLoading && error && (
          <div className="px-3 pb-3">
            <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg p-2">
              {error}
            </p>
          </div>
        )}

        {/* Pas de données */}
        {!isLoading && !error && stats && stats.nb_points === 0 && (
          <div className="px-3 pb-3">
            <p className="text-slate-500 text-xs italic text-center py-2">
              Aucun avion dans cette zone.
            </p>
          </div>
        )}

        {/* Données */}
        {!isLoading && !error && stats && stats.nb_points > 0 && (
          <div className="px-2 pb-2 space-y-2">
            <table className="w-full text-sm border-collapse">
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-1 pr-3 text-gray-500 text-xs">Vols capturés</td>
                  <td className="py-1 font-semibold text-emerald-700">{stats.nb_flights}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 pr-3 text-gray-500 text-xs">Points capturés</td>
                  <td className="py-1 font-medium">{stats.nb_points.toLocaleString('fr-FR')}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 pr-3 text-gray-500 text-xs">Altitude min</td>
                  <td className="py-1 font-medium">{formatFt(stats.alt_min)}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 pr-3 text-gray-500 text-xs">Altitude max</td>
                  <td className="py-1 font-medium">{formatFt(stats.alt_max)}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 pr-3 text-gray-500 text-xs">Altitude moy.</td>
                  <td className="py-1 font-medium">{formatFt(stats.alt_avg)}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 pr-3 text-gray-500 text-xs">Début</td>
                  <td className="py-1 font-medium text-xs">{formatDate(stats.ts_debut)}</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-1 pr-3 text-gray-500 text-xs">Fin</td>
                  <td className="py-1 font-medium text-xs">{formatDate(stats.ts_fin)}</td>
                </tr>
                {stats.radars.length > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="py-1 pr-3 text-gray-500 text-xs">Radars</td>
                    <td className="py-1 font-medium text-xs">{stats.radars.join(', ')}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Liste des vols */}
            {stats.flight_ids.length > 0 && (
              <div className="mt-1">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Vols ({stats.flight_ids.length})
                </p>
                <div className="max-h-28 overflow-y-auto space-y-0.5 border border-gray-100 rounded-md p-1 bg-gray-50">
                  {stats.flight_ids.map((fid) => (
                    <div
                      key={fid}
                      className="text-xs font-mono text-slate-700 px-1.5 py-0.5 hover:bg-emerald-50 rounded transition-colors"
                    >
                      ✈️ {fid}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bouton analyser la zone */}
            <button
              type="button"
              onClick={handleAnalyze}
              className="w-full mt-3 py-2 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg font-semibold text-xs transition-all duration-200 shadow-md hover:shadow-emerald-500/10 active:scale-95 flex items-center justify-center gap-1.5"
            >
              🔍 Analyser cette zone
            </button>
          </div>
        )}
      </div>
    </Popup>
  )
}
