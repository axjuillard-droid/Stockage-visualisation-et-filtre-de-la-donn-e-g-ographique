/**
 * BoundingBoxLayer — Affiche les emprises de vol sur la carte Leaflet.
 *
 * Chaque emprise est un Rectangle dont la couleur est déterminée dynamiquement
 * par le flight_id. Les vols retenus par le filtre sont surlignés.
 * Un popup au clic affiche les 6 informations requises du vol.
 */

import { Rectangle, Popup } from 'react-leaflet'
import type { FlightBoundingBox } from '../types'
import { flightColor } from './DbTraceLayer'

/** Formate une date ISO en chaîne lisible (fr-FR). */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

interface BoundingBoxLayerProps {
  boundingBoxes: FlightBoundingBox[]
  /** IDs des vols retenus par le dernier filtrage (pour surlignage) */
  highlightedFlightIds: string[]
}

/**
 * Couche Leaflet affichant les emprises spatiales de chaque vol.
 *
 * - Couleur unique par flight_id (HSL déterministe)
 * - fillOpacity 0.25 en mode normal, 0.55 si vol filtré (surligné)
 * - Bordure orange épaisse si vol filtré
 * - Popup au clic avec 6 informations
 */
export function BoundingBoxLayer({ boundingBoxes, highlightedFlightIds }: BoundingBoxLayerProps) {
  const highlightSet = new Set(highlightedFlightIds)

  return (
    <>
      {boundingBoxes.map((feature) => {
        const { flight_id, alt_min, alt_max, ts_debut, ts_fin, nb_points, radars } = feature.properties
        const color = flightColor(flight_id)
        const isHighlighted = highlightSet.has(flight_id)

        // Extraire les coordonnées du Polygon GeoJSON (bbox)
        // ST_Envelope retourne un Polygon avec 5 points : on prend les 4 extremes
        const coords = feature.geometry.coordinates[0]
        if (!coords || coords.length < 4) return null

        // Chercher les extremes lat/lon dans les coordonnées du polygone
        const lons = coords.map((c) => c[0])
        const lats = coords.map((c) => c[1])
        const latMin = Math.min(...lats)
        const latMax = Math.max(...lats)
        const lonMin = Math.min(...lons)
        const lonMax = Math.max(...lons)

        return (
          <Rectangle
            key={flight_id}
            bounds={[[latMin, lonMin], [latMax, lonMax]]}
            pathOptions={{
              color: color,
              fillColor: color,
              fillOpacity: isHighlighted ? 0.45 : 0.25,
              weight: isHighlighted ? 2.5 : 1.5,
              dashArray: isHighlighted ? undefined : '4 2',
            }}
          >
            <Popup>
              <div className="font-sans min-w-[200px]">
                {/* Header du popup */}
                <div
                  className="font-bold text-base px-3 py-2 rounded-t-lg text-white mb-2"
                  style={{ backgroundColor: color }}
                >
                  ✈️ {flight_id}
                  {isHighlighted && (
                    <span className="ml-2 text-xs bg-orange-500 px-1.5 py-0.5 rounded-full">
                      Retenu
                    </span>
                  )}
                </div>

                <table className="w-full text-sm border-collapse">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-1 pr-3 text-gray-500 text-xs">Alt. min</td>
                      <td className="py-1 font-medium">{alt_min !== null ? `${alt_min.toLocaleString()} ft` : '—'}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-1 pr-3 text-gray-500 text-xs">Alt. max</td>
                      <td className="py-1 font-medium">{alt_max !== null ? `${alt_max.toLocaleString()} ft` : '—'}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-1 pr-3 text-gray-500 text-xs">Début</td>
                      <td className="py-1 font-medium text-xs">{formatDate(ts_debut)}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-1 pr-3 text-gray-500 text-xs">Fin</td>
                      <td className="py-1 font-medium text-xs">{formatDate(ts_fin)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-3 text-gray-500 text-xs">Points</td>
                      <td className="py-1 font-medium">{nb_points.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-3 text-gray-500 text-xs">Radar(s)</td>
                      <td className="py-1 font-medium text-xs">
                        {radars && radars.length > 0 ? radars.join(', ') : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Popup>
          </Rectangle>
        )
      })}
    </>
  )
}
