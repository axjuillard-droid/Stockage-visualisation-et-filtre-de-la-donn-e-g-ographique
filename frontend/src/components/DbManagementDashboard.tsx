/**
 * DbManagementDashboard — Panneau plein écran d'administration de la BDD.
 * Fournit la recherche, la multi-sélection, la suppression par lot, l'import CSV et la purge globale.
 * Intègre également les filtres avancés (dates, altitude, radars, zones) avec glissement fluide.
 */

import React, { useState, useEffect } from 'react'
import { useDbManagement } from '../hooks/useDbManagement'
import {
  Search,
  Trash2,
  Eye,
  Database,
  Upload,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import type { ZoneWithId, DbStats } from '../types'
import { TimeRangeSlider } from './TimeRangeSlider'
import { AltitudeRangeSlider } from './AltitudeRangeSlider'
import { RadarFilter } from './RadarFilter'

interface DbManagementDashboardProps {
  onVisualize: (flightIds: string[]) => void
  onImportCsv: (file: File) => Promise<void>
  importState: 'idle' | 'loading' | 'success' | 'error'
  importResult: { inserted: number; skipped: number } | null
  dbError: string | null

  // Filtres partagés
  dbStats: DbStats | null
  dbDateDebut: string
  dbDateFin: string
  setDbDateDebut: (val: string) => void
  setDbDateFin: (val: string) => void
  handleResetDates: () => void

  altFilterMin: number | null
  altFilterMax: number | null
  setAltFilter: (min: number | null, max: number | null) => void

  selectedRadars: string[]
  setSelectedRadars: (radars: string[]) => void
  availableRadars: string[]
  radarsState: 'idle' | 'loading' | 'success' | 'error'

  zones: ZoneWithId[]
  removeZone: (id: string) => void
  reactivateZone: (id: string) => void
  deleteZonePermanently: (id: string) => void
}

function isoToDatetimeLocal(iso: string): string {
  try { return new Date(iso).toISOString().slice(0, 16) } catch { return '' }
}

export function DbManagementDashboard({
  onVisualize,
  onImportCsv,
  importState,
  importResult,
  dbError,
  dbStats,
  dbDateDebut,
  dbDateFin,
  setDbDateDebut,
  setDbDateFin,
  handleResetDates,
  altFilterMin,
  altFilterMax,
  setAltFilter,
  selectedRadars,
  setSelectedRadars,
  availableRadars,
  radarsState,
  zones,
  removeZone,
  reactivateZone,
  deleteZonePermanently,
}: DbManagementDashboardProps) {
  // 1. Déduction des filtres pour le hook et le backend
  const managementFilters = {
    date_debut: dbDateDebut ? new Date(dbDateDebut + 'Z').toISOString() : null,
    date_fin: dbDateFin ? new Date(dbDateFin + 'Z').toISOString() : null,
    alt_min: altFilterMin,
    alt_max: altFilterMax,
    radars: selectedRadars.length > 0 ? selectedRadars : undefined,
    zones: zones.filter((z) => z.active).map((z) => z.zone),
  }

  const {
    flights,
    totalCount,
    query,
    page,
    limit,
    selectedFlightIds,
    isLoading,
    errorMessage,
    setQuery,
    setPage,
    setSelectedFlightIds,
    loadFlights,
    deleteSelected,
    purgeAll,
  } = useDbManagement(managementFilters)

  const [confirmPurge, setConfirmPurge] = useState(false)
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false)

  // États pliables
  const [showFilters, setShowFilters] = useState(false)
  const [showManualDates, setShowManualDates] = useState(false)
  const [showManualAlt, setShowManualAlt] = useState(false)

  // Handlers pour les sliders
  const handleTimeRangeChange = (_newMin: number, _newMax: number) => {
    // Les valeurs intermédiaires de glissement ne sont pas utilisées sans la carte
  }

  const handleTimeRangeCommit = (newMin: number, newMax: number) => {
    setDbDateDebut(isoToDatetimeLocal(new Date(newMin).toISOString()))
    setDbDateFin(isoToDatetimeLocal(new Date(newMax).toISOString()))
  }

  const handleAltRangeChange = (_newMin: number, _newMax: number) => {
    // Les valeurs intermédiaires de glissement ne sont pas utilisées sans la carte
  }

  const handleAltRangeCommit = (newMin: number, newMax: number) => {
    setAltFilter(newMin, newMax)
  }

  const totalPages = Math.ceil(totalCount / limit) || 1
  const flightIdsOnPage = flights.map((f) => f.flight_id)
  const allSelectedOnPage = flightIdsOnPage.length > 0 && flightIdsOnPage.every((id) => selectedFlightIds.includes(id))

  // Recharger le tableau lors d'un import réussi
  useEffect(() => {
    if (importState === 'success') {
      void loadFlights()
    }
  }, [importState, loadFlights])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      void onImportCsv(file)
    }
  }

  const handleToggleSelectAll = () => {
    if (allSelectedOnPage) {
      setSelectedFlightIds((prev) => prev.filter((id) => !flightIdsOnPage.includes(id)))
    } else {
      setSelectedFlightIds((prev) => Array.from(new Set([...prev, ...flightIdsOnPage])))
    }
  }

  const handleToggleSelectFlight = (flightId: string) => {
    setSelectedFlightIds((prev) =>
      prev.includes(flightId) ? prev.filter((id) => id !== flightId) : [...prev, flightId]
    )
  }

  const handleDeleteSelectedConfirm = async () => {
    await deleteSelected()
    setConfirmDeleteSelected(false)
  }

  const handlePurgeConfirm = async () => {
    await purgeAll()
    setConfirmPurge(false)
  }

  // Altitudes globales
  const altGlobalMin = dbStats?.alt_min ?? 0
  const altGlobalMax = dbStats?.alt_max ?? 50000

  // Bornes temporelles pour le slider
  const dbSelMinTime = dbDateDebut 
    ? new Date(dbDateDebut + 'Z').getTime() 
    : (dbStats?.date_range ? new Date(dbStats.date_range.min).getTime() : new Date().setHours(0, 0, 0, 0) - 24 * 3600 * 1000)

  const dbSelMaxTime = dbDateFin 
    ? new Date(dbDateFin + 'Z').getTime() 
    : (dbStats?.date_range ? new Date(dbStats.date_range.max).getTime() : new Date().getTime())

  // Indicateur si des filtres sont appliqués
  const hasActiveFilters = !!dbDateDebut || !!dbDateFin || altFilterMin !== null || altFilterMax !== null || selectedRadars.length > 0 || zones.some((z) => z.active)

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6 space-y-6 text-slate-100 font-sans">
      {/* ════ SECTION TITRE & STATS ════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-500" />
            Gestion de la Base de Données
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Recherchez des vols, supprimez des données obsolètes et appliquez des filtres de sélection avancés.
          </p>
        </div>

        {/* Boutons d'action globale */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium text-xs border border-slate-700 transition cursor-pointer select-none">
            <Upload className="w-3.5 h-3.5 text-slate-300" />
            Importer un CSV
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              disabled={importState === 'loading'}
            />
          </label>

          <button
            onClick={() => setConfirmPurge(true)}
            className="px-4 py-2 bg-red-950/40 hover:bg-red-900/40 text-red-400 hover:text-red-300 border border-red-900/50 rounded-xl font-semibold text-xs transition active:scale-[0.98]"
          >
            Purger la base
          </button>
        </div>
      </div>

      {/* ── Feedback d'import ───────────────────────────────────────────── */}
      {importState === 'loading' && (
        <div className="flex items-center gap-3 bg-blue-950/30 border border-blue-900/50 rounded-xl p-4">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          <p className="text-sm text-blue-300">Importation des données en cours dans PostgreSQL...</p>
        </div>
      )}
      {importState === 'error' && dbError && (
        <div className="flex items-start gap-3 bg-red-950/30 border border-red-900/50 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-400">Échec de l'importation</p>
            <p className="text-xs text-red-300/80 mt-0.5">{dbError}</p>
          </div>
        </div>
      )}
      {importState === 'success' && importResult && (
        <div className="flex items-start gap-3 bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-400">Importation réussie !</p>
            <p className="text-xs text-emerald-300/80 mt-0.5">
              Lignes insérées : {importResult.inserted.toLocaleString()} | Lignes ignorées (doublons) : {importResult.skipped.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* ════ SECTION FILTRES AVANCÉS ══════════════════════════════════════ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between p-4 bg-slate-900/50 hover:bg-slate-900 transition font-semibold text-sm text-slate-200"
        >
          <span className="flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-500" />
            Filtres de recherche avancés
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" title="Filtres actifs" />
            )}
          </span>
          <span className="text-xs text-slate-400">
            {showFilters ? 'Masquer' : 'Afficher'}
          </span>
        </button>

        {showFilters && (
          <div className="p-5 border-t border-slate-850 bg-slate-900/25 grid grid-cols-1 md:grid-cols-3 gap-6 animate-slide-down">
            {/* Colonne 1 : Période temporelle */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Période temporelle</span>
                {dbStats?.date_range && (
                  <button
                    type="button"
                    onClick={handleResetDates}
                    className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                  >
                    ✕ Reset
                  </button>
                )}
              </div>
              <TimeRangeSlider
                valueMin={dbSelMinTime}
                valueMax={dbSelMaxTime}
                onChange={handleTimeRangeChange}
                onCommit={handleTimeRangeCommit}
              />
              {/* Saisie manuelle dates */}
              <div className="border-t border-slate-800/60 pt-3">
                <button
                  type="button"
                  onClick={() => setShowManualDates(!showManualDates)}
                  className="flex items-center justify-between w-full text-left text-xs text-slate-400 hover:text-slate-250 transition-colors select-none"
                >
                  <span>Saisie précise (manuelle)</span>
                  <span className="text-[9px] transition-transform duration-200" style={{ transform: showManualDates ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    ▼
                  </span>
                </button>
                {showManualDates && (
                  <div className="space-y-3 mt-3">
                    <label className="block">
                      <span className="text-[10px] text-slate-500 mb-1 block">Début</span>
                      <input
                        type="datetime-local"
                        value={dbDateDebut}
                        onChange={(e) => setDbDateDebut(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-slate-500 mb-1 block">Fin</span>
                      <input
                        type="datetime-local"
                        value={dbDateFin}
                        onChange={(e) => setDbDateFin(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Colonne 2 : Plage d'altitude */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Plage d'altitude</span>
                {(altFilterMin !== null || altFilterMax !== null) && (
                  <button
                    type="button"
                    onClick={() => setAltFilter(null, null)}
                    className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                  >
                    ✕ Reset
                  </button>
                )}
              </div>
              {altGlobalMin < altGlobalMax ? (
                <AltitudeRangeSlider
                  valueMin={altFilterMin ?? altGlobalMin}
                  valueMax={altFilterMax ?? altGlobalMax}
                  onChange={handleAltRangeChange}
                  onCommit={handleAltRangeCommit}
                />
              ) : (
                <p className="text-slate-555 text-xs italic">Aucune donnée d'altitude</p>
              )}
              {/* Saisie manuelle altitude */}
              {altGlobalMin < altGlobalMax && (
                <div className="border-t border-slate-800/60 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowManualAlt(!showManualAlt)}
                    className="flex items-center justify-between w-full text-left text-xs text-slate-400 hover:text-slate-250 transition-colors select-none"
                  >
                    <span>Saisie précise (manuelle)</span>
                    <span className="text-[9px] transition-transform duration-200" style={{ transform: showManualAlt ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      ▼
                    </span>
                  </button>
                  {showManualAlt && (
                    <div className="space-y-3 mt-3">
                      <label className="block">
                        <span className="text-[10px] text-slate-500 mb-1 block">Altitude Min (ft)</span>
                        <input
                          type="number"
                          value={altFilterMin !== null ? altFilterMin : ''}
                          placeholder={altGlobalMin.toString()}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : Number(e.target.value)
                            setAltFilter(val, altFilterMax)
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] text-slate-500 mb-1 block">Altitude Max (ft)</span>
                        <input
                          type="number"
                          value={altFilterMax !== null ? altFilterMax : ''}
                          placeholder={altGlobalMax.toString()}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : Number(e.target.value)
                            setAltFilter(altFilterMin, val)
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Colonne 3 : Radars & Zones géographiques */}
            <div className="space-y-4">
              <RadarFilter
                availableRadars={availableRadars}
                selectedRadars={selectedRadars}
                onChange={setSelectedRadars}
                isLoading={radarsState === 'loading'}
              />

              <div className="border-t border-slate-800/60 pt-3 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Zones géographiques</span>
                {zones.length === 0 ? (
                  <p className="text-slate-500 text-xs italic">Aucune zone créée sur la carte</p>
                ) : (
                  <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {zones.map((zw, i) => (
                      <label
                        key={zw.id}
                        className="flex items-center justify-between hover:bg-slate-800/30 rounded-lg px-2 py-1 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={zw.active}
                            onChange={() => {
                              if (zw.active) removeZone(zw.id)
                              else reactivateZone(zw.id)
                            }}
                            className="w-3.5 h-3.5 rounded text-emerald-600 bg-slate-950 border-slate-800 focus:ring-emerald-500 focus:ring-offset-slate-900"
                          />
                          <span className="text-xs text-slate-300 truncate max-w-[150px]" title={zw.zone.nom || `Zone #${i + 1}`}>
                            {zw.zone.type === 'rectangle' ? '▭' : '◯'} {zw.zone.nom || `Zone #${i + 1}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            deleteZonePermanently(zw.id)
                          }}
                          className="text-slate-500 hover:text-red-400 text-xs transition-colors ml-2"
                          title="Supprimer la zone"
                        >
                          ✕
                        </button>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ════ PANNEAU PRINCIPAL ══════════════════════════════════════════════ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Barre de recherche et état de sélection */}
        <div className="p-4 border-b border-slate-850 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Rechercher par flight_id (ex: AFR100)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl pl-9 pr-4 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition font-mono"
            />
          </div>

          <div className="text-xs text-slate-400">
            Total : <span className="font-bold text-slate-200">{totalCount}</span> vol{totalCount > 1 ? 's' : ''} retenu{totalCount > 1 ? 's' : ''}
          </div>
        </div>

        {/* Bannière d'actions groupées */}
        {selectedFlightIds.length > 0 && (
          <div className="px-4 py-3 bg-indigo-950/40 border-b border-indigo-900/40 flex items-center justify-between gap-4 animate-fade-in">
            <span className="text-xs font-semibold text-indigo-300">
              {selectedFlightIds.length} vol{selectedFlightIds.length > 1 ? 's' : ''} sélectionné{selectedFlightIds.length > 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onVisualize(selectedFlightIds)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold text-xs transition active:scale-[0.98]"
              >
                <Eye className="w-3.5 h-3.5" />
                Visualiser la sélection
              </button>
              <button
                onClick={() => setConfirmDeleteSelected(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950 hover:bg-red-900 text-red-300 hover:text-white rounded-lg font-semibold text-xs border border-red-900 transition active:scale-[0.98]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Supprimer la sélection
              </button>
            </div>
          </div>
        )}

        {/* Tableau des vols */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-slate-400 text-sm">Chargement des données...</p>
            </div>
          ) : errorMessage ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-red-400 text-sm">
              <AlertCircle className="w-8 h-8" />
              <p>{errorMessage}</p>
              <button
                onClick={() => void loadFlights()}
                className="mt-2 text-xs font-bold text-emerald-400 hover:underline"
              >
                Réessayer
              </button>
            </div>
          ) : flights.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-sm">
              Aucun vol trouvé avec les filtres actuels.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-850/40 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  <th className="py-3 px-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={allSelectedOnPage}
                      onChange={handleToggleSelectAll}
                      className="w-3.5 h-3.5 rounded text-emerald-600 bg-slate-950 border-slate-800 focus:ring-emerald-500 focus:ring-offset-slate-900"
                    />
                  </th>
                  <th className="py-3 px-4">Vol ID</th>
                  <th className="py-3 px-4 text-center">Points de traces</th>
                  <th className="py-3 px-4">Date début (UTC)</th>
                  <th className="py-3 px-4">Date fin (UTC)</th>
                  <th className="py-3 px-4 text-right">Altitude Min / Max</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50 text-sm">
                {flights.map((flight) => {
                  const isSelected = selectedFlightIds.includes(flight.flight_id)
                  return (
                    <tr
                      key={flight.flight_id}
                      className={`hover:bg-slate-800/25 transition-colors ${
                        isSelected ? 'bg-indigo-950/10' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectFlight(flight.flight_id)}
                          className="w-3.5 h-3.5 rounded text-emerald-600 bg-slate-950 border-slate-800 focus:ring-emerald-500 focus:ring-offset-slate-900"
                        />
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-200">
                        {flight.flight_id}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-300">
                        {flight.point_count.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-xs">
                        {flight.ts_start ? new Date(flight.ts_start).toLocaleString('fr-FR', { timeZone: 'UTC' }) : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-xs">
                        {flight.ts_end ? new Date(flight.ts_end).toLocaleString('fr-FR', { timeZone: 'UTC' }) : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-300">
                        {flight.alt_min !== null ? `${flight.alt_min.toLocaleString()} ft` : 'N/A'} /{' '}
                        {flight.alt_max !== null ? `${flight.alt_max.toLocaleString()} ft` : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedFlightIds([flight.flight_id])
                            setConfirmDeleteSelected(true)
                          }}
                          className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition"
                          title="Supprimer le vol entier"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!isLoading && flights.length > 0 && (
          <div className="p-4 border-t border-slate-850 flex items-center justify-between bg-slate-900/50">
            <span className="text-xs text-slate-400">
              Page <span className="font-semibold text-slate-200">{page}</span> sur{' '}
              <span className="font-semibold text-slate-200">{totalPages}</span>
            </span>

            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-1.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════ MODALS DE CONFIRMATION ════════════════════════════════════════ */}
      {/* Modal Purge */}
      {confirmPurge && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-red-900/40 rounded-2xl p-6 max-w-md w-full shadow-2xl mx-4 space-y-4">
            <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
              ⚠️ Confirmer le vidage de la base ?
            </h3>
            <p className="text-sm text-slate-300">
              Cette action est **irréversible**. Toutes les traces et tous les vols stockés en base de données seront définitivement effacés.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmPurge(false)}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Annuler
              </button>
              <button
                onClick={handlePurgeConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition active:scale-[0.98]"
              >
                Confirmer la purge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Delete Selected */}
      {confirmDeleteSelected && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-red-900/40 rounded-2xl p-6 max-w-md w-full shadow-2xl mx-4 space-y-4">
            <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
              ⚠️ Confirmer la suppression ?
            </h3>
            <p className="text-sm text-slate-300">
              Vous allez supprimer définitivement{' '}
              <span className="font-bold text-white">
                {selectedFlightIds.length} vol{selectedFlightIds.length > 1 ? 's' : ''}
              </span>{' '}
              de la base. Cette action est irréversible.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDeleteSelected(false)}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteSelectedConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition active:scale-[0.98]"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
