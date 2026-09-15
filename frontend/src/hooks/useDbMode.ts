/**
 * Hook gérant l'état complet du mode Base de Données.
 * Orchestration : import → stats → radars → emprises → filtrage → export
 *
 * Phase 4 :
 *   - Radars disponibles + sélection
 *   - Filtre altitude (double slider) : alt_min / alt_max
 *   - Statistiques de zone dessinée (ZoneStats)
 */

import { useCallback, useState } from 'react'
import type {
  DbFilterResult,
  DbImportResult,
  DbStats,
  DbViewMode,
  FilterRequest,
  FlightBoundingBox,
  LoadingState,
  DbTracePoint,
  Zone,
  ZoneStats,
} from '../types'
import {
  exportEmprises,
  filterEmprises,
  getAvailableRadars,
  getDbStats,
  getFlightBoundingBoxes,
  importCsvToDb,
  getFlightTraces,
  getZoneStats,
} from '../lib/api'

interface UseDbModeReturn {
  // ── État ─────────────────────────────────────────────────────────────────
  dbStats: DbStats | null
  importResult: DbImportResult | null
  boundingBoxes: FlightBoundingBox[]
  filterResult: DbFilterResult | null
  exportBlob: Blob | null
  viewMode: DbViewMode
  selectedFlightIds: string[]
  dbTraces: Record<string, DbTracePoint[]>
  showSegments: boolean
  // Radars
  availableRadars: string[]
  selectedRadars: string[]
  // Altitude
  altFilterMin: number | null
  altFilterMax: number | null
  // Stats de zone
  zoneStats: ZoneStats | null
  // ── Loading states ───────────────────────────────────────────────────────
  importState: LoadingState
  statsState: LoadingState
  bbState: LoadingState
  filterState: LoadingState
  exportState: LoadingState
  tracesState: LoadingState
  radarsState: LoadingState
  zoneStatsState: LoadingState
  errorMessage: string | null
  // ── Actions ──────────────────────────────────────────────────────────────
  importCsv: (file: File) => Promise<void>
  loadStats: () => Promise<void>
  loadBoundingBoxes: (dateDebut: string | null, dateFin: string | null, radars?: string[]) => Promise<void>
  applyDbFilter: (request: FilterRequest) => Promise<void>
  exportDb: (request: FilterRequest) => Promise<void>
  loadTraces: (
    flightIds: string[],
    dateDebut: string | null,
    dateFin: string | null,
    altMin?: number | null,
    altMax?: number | null,
    zones?: Zone[] | null,
  ) => Promise<void>
  loadRadars: () => Promise<void>
  setSelectedFlightIds: (ids: string[] | ((prev: string[]) => string[])) => void
  setShowSegments: (show: boolean) => void
  setViewMode: (mode: DbViewMode) => void
  setFilterResult: (result: DbFilterResult | null) => void
  setSelectedRadars: (radars: string[]) => void
  setAltFilter: (min: number | null, max: number | null) => void
  loadZoneStats: (
    zone: Zone,
    dateDebut?: string | null,
    dateFin?: string | null,
    radars?: string[] | null,
    altMin?: number | null,
    altMax?: number | null,
  ) => Promise<void>
  resetFilter: () => void
  resetAll: () => void
}

export function useDbMode(): UseDbModeReturn {
  const [dbStats, setDbStats] = useState<DbStats | null>(null)
  const [importResult, setImportResult] = useState<DbImportResult | null>(null)
  const [boundingBoxes, setBoundingBoxes] = useState<FlightBoundingBox[]>([])
  const [filterResult, setFilterResult] = useState<DbFilterResult | null>(null)
  const [exportBlob, setExportBlob] = useState<Blob | null>(null)
  const [viewMode, setViewMode] = useState<DbViewMode>('emprises')

  const [selectedFlightIds, setSelectedFlightIds] = useState<string[]>([])
  const [dbTraces, setDbTraces] = useState<Record<string, DbTracePoint[]>>({})
  const [showSegments, setShowSegments] = useState<boolean>(true)

  // Radars
  const [availableRadars, setAvailableRadars] = useState<string[]>([])
  const [selectedRadars, setSelectedRadars] = useState<string[]>([])

  // Altitude
  const [altFilterMin, setAltFilterMin] = useState<number | null>(null)
  const [altFilterMax, setAltFilterMax] = useState<number | null>(null)

  // Zone stats
  const [zoneStats, setZoneStats] = useState<ZoneStats | null>(null)

  const [importState, setImportState] = useState<LoadingState>('idle')
  const [statsState, setStatsState] = useState<LoadingState>('idle')
  const [bbState, setBbState] = useState<LoadingState>('idle')
  const [filterState, setFilterState] = useState<LoadingState>('idle')
  const [exportState, setExportState] = useState<LoadingState>('idle')
  const [tracesState, setTracesState] = useState<LoadingState>('idle')
  const [radarsState, setRadarsState] = useState<LoadingState>('idle')
  const [zoneStatsState, setZoneStatsState] = useState<LoadingState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // ── Import CSV → BDD ────────────────────────────────────────────────────
  const importCsv = useCallback(async (file: File): Promise<void> => {
    setImportState('loading')
    setErrorMessage(null)
    try {
      const result = await importCsvToDb(file)
      setImportResult(result)
      setImportState('success')
      // Après import, charger les stats automatiquement
      await loadStatsInternal()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue')
      setImportState('error')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stats ────────────────────────────────────────────────────────────────
  const loadStatsInternal = async (): Promise<void> => {
    setStatsState('loading')
    try {
      const stats = await getDbStats()
      setDbStats(stats)
      setStatsState('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue')
      setStatsState('error')
    }
  }

  const loadStats = useCallback(loadStatsInternal, [])

  // ── Radars ───────────────────────────────────────────────────────────────
  const loadRadars = useCallback(async (): Promise<void> => {
    setRadarsState('loading')
    try {
      const radars = await getAvailableRadars()
      setAvailableRadars(radars)
      setSelectedRadars(radars)
      setRadarsState('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue')
      setRadarsState('error')
    }
  }, [])

  const setAltFilter = useCallback((min: number | null, max: number | null) => {
    setAltFilterMin(min)
    setAltFilterMax(max)
  }, [])

  // ── Emprises ─────────────────────────────────────────────────────────────
  const loadBoundingBoxes = useCallback(async (
    dateDebut: string | null = null,
    dateFin: string | null = null,
    radars?: string[],
  ): Promise<void> => {
    setBbState('loading')
    setErrorMessage(null)
    try {
      const boxes = await getFlightBoundingBoxes(dateDebut, dateFin, radars)
      setBoundingBoxes(boxes)
      setBbState('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue')
      setBbState('error')
    }
  }, [])

  // ── Traces / Points ──────────────────────────────────────────────────────
  const loadTraces = useCallback(async (
    flightIds: string[],
    dateDebut: string | null,
    dateFin: string | null,
    altMin?: number | null,
    altMax?: number | null,
    zones?: Zone[] | null,
  ): Promise<void> => {
    if (flightIds.length === 0) {
      setDbTraces({})
      setTracesState('success')
      return
    }
    setTracesState('loading')
    setErrorMessage(null)
    try {
      const traces = await getFlightTraces({
        flight_ids: flightIds,
        date_debut: dateDebut ? new Date(dateDebut).toISOString() : null,
        date_fin: dateFin ? new Date(dateFin).toISOString() : null,
        alt_min: altMin ?? null,
        alt_max: altMax ?? null,
        zones: zones ?? null,
      })
      setDbTraces(traces)
      setTracesState('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue')
      setTracesState('error')
    }
  }, [])

  // ── Filtrage ─────────────────────────────────────────────────────────────
  const applyDbFilter = useCallback(async (request: FilterRequest): Promise<void> => {
    setFilterState('loading')
    setErrorMessage(null)
    setExportBlob(null)
    try {
      const result = await filterEmprises(request)
      setFilterResult(result)
      setFilterState('success')
      // Synchroniser les cases à cocher sur les seuls vols retenus
      setSelectedFlightIds(result.flight_ids)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue')
      setFilterState('error')
    }
  }, [])

  // ── Export ───────────────────────────────────────────────────────────────
  const exportDb = useCallback(async (request: FilterRequest): Promise<void> => {
    setExportState('loading')
    setErrorMessage(null)
    try {
      const blob = await exportEmprises(request)
      setExportBlob(blob)
      setExportState('success')
      // Déclencher le téléchargement immédiatement
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `export_emprises_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue')
      setExportState('error')
    }
  }, [])

  // ── Statistiques de zone ─────────────────────────────────────────────────
  const loadZoneStats = useCallback(async (
    zone: Zone,
    dateDebut?: string | null,
    dateFin?: string | null,
    radars?: string[] | null,
    altMin?: number | null,
    altMax?: number | null,
  ): Promise<void> => {
    setZoneStats(null)
    setZoneStatsState('loading')
    try {
      const stats = await getZoneStats({
        zone,
        date_debut: dateDebut ?? null,
        date_fin: dateFin ?? null,
        radars: radars ?? null,
        alt_min: altMin ?? null,
        alt_max: altMax ?? null,
      })
      setZoneStats(stats)
      setZoneStatsState('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur inconnue')
      setZoneStatsState('error')
    }
  }, [])

  const resetFilter = useCallback((): void => {
    setFilterResult(null)
    setExportBlob(null)
    setFilterState('idle')
    setExportState('idle')
    // Revenir à une sélection vide
    setSelectedFlightIds([])
  }, [])

  const resetAll = useCallback((): void => {
    setDbStats(null)
    setImportResult(null)
    setBoundingBoxes([]); setFilterResult(null)
    setExportBlob(null)
    setSelectedFlightIds([])
    setDbTraces({})
    setShowSegments(true)
    setAvailableRadars([])
    setSelectedRadars([])
    setAltFilterMin(null)
    setAltFilterMax(null)
    setZoneStats(null)
    setImportState('idle')
    setStatsState('idle')
    setBbState('idle')
    setFilterState('idle')
    setExportState('idle')
    setTracesState('idle')
    setRadarsState('idle')
    setZoneStatsState('idle')
    setErrorMessage(null)
  }, [])

  return {
    dbStats,
    importResult,
    boundingBoxes,
    filterResult,
    exportBlob,
    viewMode,
    selectedFlightIds,
    dbTraces,
    showSegments,
    availableRadars,
    selectedRadars,
    altFilterMin,
    altFilterMax,
    zoneStats,
    importState,
    statsState,
    bbState,
    filterState,
    exportState,
    tracesState,
    radarsState,
    zoneStatsState,
    errorMessage,
    importCsv,
    loadStats,
    loadBoundingBoxes,
    applyDbFilter,
    exportDb,
    loadTraces,
    loadRadars,
    setSelectedFlightIds,
    setShowSegments,
    setViewMode,
    setFilterResult,
    setSelectedRadars,
    setAltFilter,
    loadZoneStats,
    resetFilter,
    resetAll,
  }
}
