/**
 * DbTraceLayer — Affiche les traces et trajectoires BDD (PostGIS) sur la carte.
 * Dessine des segments (polylines) et des points (CircleMarker) pour chaque vol sélectionné.
 */

import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import type { DbTracePoint } from '../types'

const PREMIUM_PALETTE = [
  'hsl(210, 95%, 55%)',  // Bleu royal électrique
  'hsl(145, 85%, 45%)',  // Vert émeraude
  'hsl(35, 95%, 50%)',   // Orange chaud
  'hsl(325, 90%, 55%)',  // Rose vif
  'hsl(265, 85%, 60%)',  // Violet lumineux
  'hsl(180, 85%, 45%)',  // Turquoise intense
  'hsl(12, 90%, 55%)',   // Rouge corail
  'hsl(85, 90%, 45%)',   // Vert lime
  'hsl(285, 80%, 55%)',  // Magenta orchidée
  'hsl(200, 90%, 50%)',  // Bleu ciel
]

/** Génère une couleur HSL déterministe et contrastée à partir d'une chaîne de vol. */
export function flightColor(flightId: string): string {
  let hash = 0
  for (let i = 0; i < flightId.length; i++) {
    hash = flightId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % PREMIUM_PALETTE.length
  return PREMIUM_PALETTE[index]
}

interface DbTraceLayerProps {
  dbTraces: Record<string, DbTracePoint[]>
  selectedFlightIds: string[]
  showSegments: boolean
  liveMinTime?: number | null
  liveMaxTime?: number | null
  liveMinAlt?: number | null
  liveMaxAlt?: number | null
}

export function DbTraceLayer({
  dbTraces,
  selectedFlightIds,
  showSegments,
  liveMinTime = null,
  liveMaxTime = null,
  liveMinAlt = null,
  liveMaxAlt = null,
}: DbTraceLayerProps) {
  return (
    <>
      {selectedFlightIds.map((flightId) => {
        const rawPoints = dbTraces[flightId] || []
        if (rawPoints.length === 0) return null

        // Un point est actif s'il respecte le filtre temporel, le filtre d'altitude et la zone géographique
        const isPointActive = (p: DbTracePoint) => {
          if (p.in_zone === false) return false

          if (liveMinTime !== null && liveMaxTime !== null) {
            const t = new Date(p.ts).getTime()
            if (t < liveMinTime || t > liveMaxTime) return false
          }

          if (liveMinAlt !== null && liveMaxAlt !== null) {
            if (p.altitude === null) return false
            if (p.altitude < liveMinAlt || p.altitude > liveMaxAlt) return false
          }

          return true
        }

        // Si le vol n'a aucun point actif (détecté dans le filtre), il ne doit pas être visible
        const hasActivePoint = rawPoints.some(isPointActive)
        if (!hasActivePoint) return null

        // Les points hors cadre (temporel ou altitude) sont marqués dimmed pour être plus ternes
        const points = rawPoints.map((p) => ({
          ...p,
          dimmed: !isPointActive(p),
        }))

        const color = flightColor(flightId)
        return (
          <g key={flightId}>
            {/* Tracer le segment reliant les points chronologiquement */}
            {showSegments && points.length > 1 && (
              <>
                {points.slice(0, -1).map((p, i) => {
                  const nextP = points[i + 1]
                  const isP1Dimmed = p.dimmed
                  const isP2Dimmed = nextP.dimmed

                  let pathOptions = {}
                  if (isP1Dimmed && isP2Dimmed) {
                    // Les deux points sont hors-filtre (gris, très fin, pointillés)
                    pathOptions = {
                      color: '#64748b',
                      weight: 1.5,
                      opacity: 0.25,
                      dashArray: '3, 6',
                    }
                  } else if (!isP1Dimmed && !isP2Dimmed) {
                    // Les deux points sont dans le filtre (couleur vive)
                    pathOptions = {
                      color: color,
                      weight: 3,
                      opacity: 0.8,
                    }
                  } else {
                    // Segment de transition (couleur du vol, plus fin, semi-transparent et pointillés)
                    pathOptions = {
                      color: color,
                      weight: 2,
                      opacity: 0.5,
                      dashArray: '5, 5',
                    }
                  }

                  return (
                    <Polyline
                      key={`${flightId}-segment-${i}-${isP1Dimmed ? 'd' : 'n'}-${isP2Dimmed ? 'd' : 'n'}`}
                      positions={[
                        [p.latitude, p.longitude],
                        [nextP.latitude, nextP.longitude]
                      ]}
                      pathOptions={pathOptions}
                    />
                  )
                })}
              </>
            )}

            {/* Points dimmed (hors plage altitude) — rendus en dessous des normaux */}
            {points
              .filter((p) => p.dimmed)
              .map((p, index) => (
                <CircleMarker
                  key={`${flightId}-dimmed-${p.ts}-${index}`}
                  center={[p.latitude, p.longitude]}
                  radius={3}
                  pathOptions={{
                    color: '#666',
                    fillColor: '#444',
                    fillOpacity: 0.3,
                    weight: 0.5,
                  }}
                >
                  <Tooltip>
                    <div className="text-xs font-mono">
                      <div className="font-bold text-sm text-slate-400 border-b border-slate-700 pb-1 mb-1">
                        ✈️ {flightId} <span className="text-[10px] text-slate-500">(hors filtre altitude)</span>
                      </div>
                      <div>🕐 {new Date(p.ts).toLocaleString('fr-FR')}</div>
                      {p.altitude !== null && (
                        <div className="text-slate-400 mt-0.5">📈 {p.altitude.toLocaleString()} ft</div>
                      )}
                    </div>
                  </Tooltip>
                </CircleMarker>
              ))}

            {/* Points normaux (dans la plage altitude) — rendus par-dessus */}
            {points
              .filter((p) => !p.dimmed)
              .map((p, index) => (
                <CircleMarker
                  key={`${flightId}-${p.ts}-${index}`}
                  center={[p.latitude, p.longitude]}
                  radius={5}
                  pathOptions={{
                    color: '#ffffff',
                    fillColor: color,
                    fillOpacity: 1.0,
                    weight: 1,
                  }}
                >
                  <Tooltip>
                    <div className="text-xs font-mono">
                      <div className="font-bold text-sm text-slate-100 border-b border-slate-700 pb-1 mb-1 flex items-center justify-between gap-4">
                        <span>✈️ {flightId}</span>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      </div>
                      <div>🕐 {new Date(p.ts).toLocaleString('fr-FR')}</div>
                      {p.altitude !== null && (
                        <div className="font-semibold text-emerald-400 mt-0.5">📈 {p.altitude.toLocaleString()} ft</div>
                      )}
                      <div className="text-[10px] text-slate-400 mt-1">
                        {p.latitude.toFixed(5)}°, {p.longitude.toFixed(5)}°
                      </div>
                    </div>
                  </Tooltip>
                </CircleMarker>
              ))}
          </g>
        )
      })}
    </>
  )
}
