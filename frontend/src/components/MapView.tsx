/**
 * MapView — Composant principal de la carte Leaflet.
 * v4 : supporte les deux modes (CSV / BDD), les emprises, les stats de zone.
 */

import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import L from 'leaflet'
import type {
  FlightBoundingBox,
  Zone,
  ZoneWithId,
  AppMode,
  DbTracePoint,
  ZoneStats,
} from '../types'
import { ZoneDrawer } from './ZoneDrawer'
import { BoundingBoxLayer } from './BoundingBoxLayer'
import { DbTraceLayer } from './DbTraceLayer'
import { ZoneStatsPopup } from './ZoneStatsPopup'

// Fix icônes Leaflet avec Vite
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const WORLD_BOUNDS: L.LatLngBoundsLiteral = [[-85, -180], [85, 180]]

interface MapViewProps {
  // Zones de filtre (commun aux deux modes)
  zones: ZoneWithId[]
  onZoneAdd: (zone: Zone, leafletId: number) => void
  onZoneRemove: (leafletId: number) => void
  onZoneEdit: (leafletId: number, zone: Zone) => void
  onZoneLeafletIdUpdate: (id: string, leafletId: number) => void



  // Mode BDD — Emprises
  boundingBoxes?: FlightBoundingBox[]
  highlightedFlightIds?: string[]
  showBoundingBoxes?: boolean

  // Mode BDD — Traces/Points
  appMode?: AppMode
  dbTraces?: Record<string, DbTracePoint[]>
  selectedFlightIds?: string[]
  showSegments?: boolean

  // Stats de zone
  onZoneClick?: (zone: Zone, center: [number, number]) => void
  statsPopupPosition: [number, number] | null
  onCloseStatsPopup: () => void
  zoneStats?: ZoneStats | null
  zoneStatsLoading?: boolean
  zoneStatsError?: string | null
  activeStatsZone: { zone: Zone; center: [number, number] } | null
  onAnalyze: (stats: ZoneStats) => void
  liveMinTime?: number | null
  liveMaxTime?: number | null
  liveMinAlt?: number | null
  liveMaxAlt?: number | null
}

/**
 * Carte Leaflet principale — bornée au monde réel, carte finie.
 * Affiche conditionnellement les points CSV, les emprises BDD, ou les trajectoires BDD.
 * En mode BDD, un clic sur une zone dessinée ouvre le popup de statistiques.
 */
export function MapView({
  zones,
  onZoneAdd,
  onZoneRemove,
  onZoneEdit,
  onZoneLeafletIdUpdate,
  boundingBoxes = [],
  highlightedFlightIds = [],
  showBoundingBoxes = false,
  appMode = 'db',
  dbTraces = {},
  selectedFlightIds = [],
  showSegments = true,
  onZoneClick,
  statsPopupPosition,
  onCloseStatsPopup,
  zoneStats = null,
  zoneStatsLoading = false,
  zoneStatsError = null,
  activeStatsZone,
  onAnalyze,
  liveMinTime = null,
  liveMaxTime = null,
  liveMinAlt = null,
  liveMaxAlt = null,
}: MapViewProps) {

  return (
    <MapContainer
      center={[46.5, 2.3]}
      zoom={6}
      minZoom={2}
      maxZoom={18}
      maxBounds={WORLD_BOUNDS}
      maxBoundsViscosity={1.0}
      style={{ height: '100%', width: '100%' }}
      className="rounded-xl overflow-hidden"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        noWrap={true}
      />

      <ZoneDrawer
        zones={zones}
        onZoneAdd={onZoneAdd}
        onZoneRemove={onZoneRemove}
        onZoneEdit={onZoneEdit}
        onZoneLeafletIdUpdate={onZoneLeafletIdUpdate}
        onZoneClick={appMode === 'db' ? onZoneClick : undefined}
      />

      {/* Mode BDD — Emprises */}
      {showBoundingBoxes && boundingBoxes.length > 0 && (
        <BoundingBoxLayer
          boundingBoxes={boundingBoxes}
          highlightedFlightIds={highlightedFlightIds}
        />
      )}

      {/* Mode BDD — Traces/Points */}
      {appMode === 'db' && !showBoundingBoxes && (
        <DbTraceLayer
          dbTraces={dbTraces}
          selectedFlightIds={selectedFlightIds}
          showSegments={showSegments}
          liveMinTime={liveMinTime}
          liveMaxTime={liveMaxTime}
          liveMinAlt={liveMinAlt}
          liveMaxAlt={liveMaxAlt}
        />
      )}



      {/* Popup statistiques de zone (mode BDD uniquement) */}
      {appMode === 'db' && statsPopupPosition && activeStatsZone && (
        <ZoneStatsPopup
          zone={activeStatsZone.zone}
          position={statsPopupPosition}
          stats={zoneStats}
          isLoading={zoneStatsLoading}
          error={zoneStatsError}
          onClose={onCloseStatsPopup}
          onAnalyze={onAnalyze}
        />
      )}
    </MapContainer>
  )
}
