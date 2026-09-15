/**
 * Client HTTP typé vers l'API backend.
 * Toutes les fonctions propagent les erreurs avec un message lisible.
 */

import type {
  DbFilterResult,
  DbImportResult,
  DbStats,
  FilterRequest,
  FlightBoundingBox,
  DbTracePoint,
  DbTracesRequest,
  FlightsManagementResponse,
  ZoneStats,
  ZoneStatsRequest,
} from '../types'

/** URL de base de l'API — vide pour utiliser le proxy Nginx/Vite. */
const API_BASE = ''



export async function getHealth(): Promise<{ status: string; database: string }> {
  const response = await fetch(`${API_BASE}/api/health`)
  if (!response.ok) throw new Error('Backend inaccessible')
  return response.json() as Promise<{ status: string; database: string }>
}

// ─── Mode BDD ─────────────────────────────────────────────────────────────────

/**
 * Importe un fichier CSV dans PostgreSQL/PostGIS.
 * @returns Nombre de lignes insérées / ignorées
 */
export async function importCsvToDb(file: File): Promise<DbImportResult> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${API_BASE}/api/db/import`, { method: 'POST', body: form })
  if (!response.ok) throw new Error(`Import BDD impossible : ${await extractErrorDetail(response)}`)
  return response.json() as Promise<DbImportResult>
}

/**
 * Récupère les statistiques globales de la base de données.
 */
export async function getDbStats(): Promise<DbStats> {
  const response = await fetch(`${API_BASE}/api/db/stats`)
  if (!response.ok) throw new Error(`Stats BDD inaccessibles : ${await extractErrorDetail(response)}`)
  return response.json() as Promise<DbStats>
}

export async function getFlightBoundingBoxes(
  dateDebut?: string | null,
  dateFin?: string | null,
  radars?: string[],
): Promise<FlightBoundingBox[]> {
  const params = new URLSearchParams()
  if (dateDebut) params.append('date_debut', dateDebut)
  if (dateFin) params.append('date_fin', dateFin)
  if (radars && radars.length > 0) {
    radars.forEach((r) => params.append('radars', r))
  }

  const url = `${API_BASE}/api/db/emprises${params.toString() ? '?' + params.toString() : ''}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Emprises inaccessibles : ${await extractErrorDetail(response)}`)
  const data = await response.json() as { features: FlightBoundingBox[] }
  return data.features
}

/**
 * Filtre les vols dont l'emprise intersecte les zones de filtre.
 * @param request - Zones + plage de dates
 * @returns Nombre de vols retenus et leurs identifiants
 */
export async function filterEmprises(request: FilterRequest): Promise<DbFilterResult> {
  const form = new FormData()
  form.append('request', JSON.stringify(request))
  const response = await fetch(`${API_BASE}/api/db/filter-emprises`, { method: 'POST', body: form })
  if (!response.ok) throw new Error(`Filtrage BDD impossible : ${await extractErrorDetail(response)}`)
  return response.json() as Promise<DbFilterResult>
}

/**
 * Exporte en CSV toutes les traces des vols dont l'emprise intersecte les zones.
 * COMPORTEMENT INCLUSIF : toutes les traces du vol, même hors zone.
 */
export async function exportEmprises(request: FilterRequest): Promise<Blob> {
  const form = new FormData()
  form.append('request', JSON.stringify(request))
  const response = await fetch(`${API_BASE}/api/db/export-emprises`, { method: 'POST', body: form })
  if (!response.ok) throw new Error(`Export BDD impossible : ${await extractErrorDetail(response)}`)
  return response.blob()
}

/**
 * Récupère les points de traces ordonnés pour des vols spécifiques en BDD.
 * Chaque point possède un champ `dimmed` si hors de la plage alt_min/alt_max.
 */
export async function getFlightTraces(request: DbTracesRequest): Promise<Record<string, DbTracePoint[]>> {
  const response = await fetch(`${API_BASE}/api/db/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(`Chargement des traces BDD impossible : ${await extractErrorDetail(response)}`)
  return response.json() as Promise<Record<string, DbTracePoint[]>>
}

/**
 * Récupère la liste des radars disponibles dans la base.
 */
export async function getAvailableRadars(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/api/db/radars`)
  if (!response.ok) throw new Error(`Radars inaccessibles : ${await extractErrorDetail(response)}`)
  return response.json() as Promise<string[]>
}

/**
 * Calcule les statistiques des avions présents dans une zone géographique.
 */
export async function getZoneStats(request: ZoneStatsRequest): Promise<ZoneStats> {
  const response = await fetch(`${API_BASE}/api/db/zone-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(`Stats de zone impossibles : ${await extractErrorDetail(response)}`)
  return response.json() as Promise<ZoneStats>
}

/**
 * Récupère la liste des vols distincts avec statistiques pour la gestion.
 */
export async function getFlightsManagement(
  query: string,
  limit: number,
  offset: number,
  filters?: {
    date_debut?: string | null
    date_fin?: string | null
    alt_min?: number | null
    alt_max?: number | null
    radars?: string[]
    zones?: any[]
  }
): Promise<FlightsManagementResponse> {
  const response = await fetch(`${API_BASE}/api/db/management/flights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      limit,
      offset,
      ...filters,
    }),
  })
  if (!response.ok) throw new Error(`Recherche de vols impossible : ${await extractErrorDetail(response)}`)
  return response.json() as Promise<FlightsManagementResponse>
}

/**
 * Supprime définitivement de la base tous les points de plusieurs vols spécifiés.
 */
export async function deleteFlightsManagement(flightIds: string[]): Promise<{ deleted: number }> {
  const response = await fetch(`${API_BASE}/api/db/management/flights/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flight_ids: flightIds }),
  })
  if (!response.ok) throw new Error(`Suppression des vols impossible : ${await extractErrorDetail(response)}`)
  return response.json() as Promise<{ deleted: number }>
}

/**
 * Purge complètement la table des traces d'avions.
 */
export async function purgeDb(): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE}/api/db/management/purge`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error(`Purge de la base impossible : ${await extractErrorDetail(response)}`)
  return response.json() as Promise<{ status: string; message: string }>
}

// ─── Utilitaire ───────────────────────────────────────────────────────────────

async function extractErrorDetail(response: Response): Promise<string> {
  try {
    const json = await response.json() as { detail?: string | unknown }
    if (typeof json.detail === 'string') return json.detail
    return JSON.stringify(json.detail ?? json)
  } catch {
    return `HTTP ${response.status} ${response.statusText}`
  }
}
