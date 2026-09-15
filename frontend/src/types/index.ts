/**
 * Types TypeScript partagés pour le POC Filtrage de traces d'avions.
 */

// ─── Traces ───────────────────────────────────────────────────────────────────

/** Un point de trace d'avion géolocalisé. */
export interface TracePoint {
  flight_id: string
  latitude: number
  longitude: number
  ts: string
  altitude: number | null
}

/** Un point de trace d'avion récupéré depuis la base de données. */
export interface DbTracePoint {
  latitude: number
  longitude: number
  ts: string
  altitude: number | null
  /** True = point hors de la plage d'altitude du filtre (affiché sobrement) */
  dimmed?: boolean
  in_zone?: boolean
}

/** Requête pour récupérer les points de traces de vols spécifiques. */
export interface DbTracesRequest {
  flight_ids: string[]
  date_debut: string | null // ISO 8601
  date_fin: string | null   // ISO 8601
  alt_min?: number | null   // Altitude minimale du filtre (pieds)
  alt_max?: number | null   // Altitude maximale du filtre (pieds)
  zones?: Zone[] | null     // Zones géographiques actives
}


// ─── Zones géographiques ──────────────────────────────────────────────────────

/** Zone rectangulaire définie par ses bornes lat/lon. */
export interface ZoneRectangle {
  type: 'rectangle'
  nom?: string
  lat_min: number
  lat_max: number
  lon_min: number
  lon_max: number
  rotation?: number
}

/** Zone circulaire définie par un centre et un rayon. */
export interface ZoneCercle {
  type: 'cercle'
  nom?: string
  lat: number
  lon: number
  rayon_km: number
}

/** Union des zones géographiques supportées. */
export type Zone = ZoneRectangle | ZoneCercle

/** Zone avec identifiant unique pour la gestion d'état. */
export interface ZoneWithId {
  id: string
  zone: Zone
  /** Layer Leaflet associé (référence opaque) */
  leafletId?: number
  /** Indique si la zone est active pour le filtrage */
  active?: boolean
}

// ─── Requêtes API ─────────────────────────────────────────────────────────────

/** Requête de filtrage envoyée à l'API. */
export interface FilterRequest {
  date_debut?: string  // ISO 8601
  date_fin?: string    // ISO 8601
  zones: Zone[]
  /** Liste des radars à inclure (vide = tous) */
  radars?: string[]
}

// ─── Réponses API ─────────────────────────────────────────────────────────────



// ─── GeoJSON minimal ──────────────────────────────────────────────────────────

export interface GeoJSONPoint {
  type: 'Point'
  coordinates: [number, number]
}

export interface GeoJSONFeatureProperties {
  flight_id: string
  ts: string
  altitude: number | null
}

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: GeoJSONPoint
  properties: GeoJSONFeatureProperties
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

// ─── États de l'application ───────────────────────────────────────────────────

/** État du chargement d'une opération asynchrone. */
export type LoadingState = 'idle' | 'loading' | 'success' | 'error'

// ─── Mode application ───────────────────────────────────────────────────────────────────

/** Mode de l'application : traitement en mémoire ou persistance BDD. */
export type AppMode = 'db' | 'db_manage'

/** Vue en mode BDD : points bruts ou emprises de vol. */
export type DbViewMode = 'points' | 'emprises'

// ─── Mode BDD ───────────────────────────────────────────────────────────────────────

/** Statistiques globales de la base de données. */
export interface DbStats {
  total_traces: number
  total_flights: number
  date_range: {
    min: string
    max: string
  } | null
  /** Altitude minimale globale (pour borner les sliders) */
  alt_min: number | null
  /** Altitude maximale globale (pour borner les sliders) */
  alt_max: number | null
}

/** Résultat d'import CSV vers la BDD. */
export interface DbImportResult {
  inserted: number
  skipped: number
}

/** Propriétés d'une emprise de vol (Bounding Box). */
export interface FlightBBoxProperties {
  flight_id: string
  alt_min: number | null
  alt_max: number | null
  ts_debut: string | null
  ts_fin: string | null
  nb_points: number
  /** Liste des radars ayant détecté ce vol */
  radars: string[]
}

/** Feature GeoJSON représentant l'emprise spatiale d'un vol. */
export interface FlightBoundingBox {
  type: 'Feature'
  geometry: {
    type: 'Polygon'
    coordinates: number[][][]
  }
  properties: FlightBBoxProperties
}

/** Résultat du filtrage par intersection. */
export interface DbFilterResult {
  count: number
  flight_ids: string[]
}

/** Statistiques détaillées d'un vol pour la gestion de la base de données. */
export interface DbFlightStats {
  flight_id: string
  point_count: number
  ts_start: string | null
  ts_end: string | null
  alt_min: number | null
  alt_max: number | null
}

/** Réponse paginée de la liste des vols avec statistiques. */
export interface FlightsManagementResponse {
  total_count: number
  flights: DbFlightStats[]
}

/** Statistiques agrégées d'une zone géographique. */
export interface ZoneStats {
  nb_flights: number
  nb_points: number
  flight_ids: string[]
  alt_min: number | null
  alt_max: number | null
  alt_avg: number | null
  radars: string[]
  ts_debut: string | null
  ts_fin: string | null
}

/** Requête pour les statistiques de zone. */
export interface ZoneStatsRequest {
  zone: Zone
  date_debut?: string | null
  date_fin?: string | null
  radars?: string[] | null
  alt_min?: number | null
  alt_max?: number | null
}
