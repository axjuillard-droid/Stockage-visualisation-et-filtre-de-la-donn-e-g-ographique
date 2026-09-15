import { useCallback, useEffect, useState } from 'react'
import { useMapZones } from './hooks/useMapZones'
import { useDbMode } from './hooks/useDbMode'
import { MapView } from './components/MapView'
import { DbConnector } from './components/DbConnector'
import { ZoneManualForm } from './components/ZoneManualForm'
import { flightColor } from './components/DbTraceLayer'
import { DbManagementDashboard } from './components/DbManagementDashboard'
import { RadarFilter } from './components/RadarFilter'
import { AltitudeRangeSlider } from './components/AltitudeRangeSlider'
import { TimeRangeSlider } from './components/TimeRangeSlider'
import type { AppMode, DbViewMode, Zone, ZoneRectangle, ZoneStats } from './types'

function isoToDatetimeLocal(iso: string): string {
  try { return new Date(iso).toISOString().slice(0, 16) } catch { return '' }
}

export default function App() {
  // ── Mode global ───────────────────────────────────────────────────────────
  const [appMode, setAppMode] = useState<AppMode>('db')
  const [dbViewMode, setDbViewMode] = useState<DbViewMode>('emprises')
  const [activeStatsZone, setActiveStatsZone] = useState<{ zone: Zone; center: [number, number] } | null>(null)
  const [showManualDates, setShowManualDates] = useState(false)
  const [showManualAlt, setShowManualAlt] = useState(false)
  const [expandedSlider, setExpandedSlider] = useState<'time' | 'altitude' | null>(null)

  // ── Zones (partagées entre les modes) ─────────────────────────────────────
  const {
    zones,
    addZone,
    removeZone,
    removeZoneByLeafletId,
    editZoneByLeafletId,
    reactivateZone,
    deleteZonePermanently,
    updateZoneLeafletId,
  } = useMapZones()



  // ── Mode BDD ──────────────────────────────────────────────────────────────
  const {
    dbStats,
    importResult,
    boundingBoxes,
    filterResult,
    importState,
    bbState,
    filterState: dbFilterState,
    exportState,
    errorMessage: dbError,
    importCsv,
    loadBoundingBoxes,
    applyDbFilter,
    exportDb,
    loadStats,
    selectedFlightIds,
    dbTraces,
    showSegments,
    tracesState,
    loadTraces,
    setSelectedFlightIds,
    setShowSegments,
    setFilterResult,
    // Radars
    availableRadars,
    selectedRadars,
    radarsState,
    loadRadars,
    setSelectedRadars,
    // Altitude
    altFilterMin,
    altFilterMax,
    setAltFilter,
    // Zone stats
    zoneStats,
    zoneStatsState,
    loadZoneStats,
  } = useDbMode()

  const [dbDateDebut, setDbDateDebut] = useState('')
  const [dbDateFin, setDbDateFin] = useState('')

  const [liveMinTime, setLiveMinTime] = useState<number | null>(null)
  const [liveMaxTime, setLiveMaxTime] = useState<number | null>(null)

  const [liveMinAlt, setLiveMinAlt] = useState<number | null>(null)
  const [liveMaxAlt, setLiveMaxAlt] = useState<number | null>(null)

  // Synchroniser les temps de filtrage client en direct avec les dates validées
  useEffect(() => {
    const minT = dbDateDebut ? new Date(dbDateDebut + 'Z').getTime() : null
    const maxT = dbDateFin ? new Date(dbDateFin + 'Z').getTime() : null
    setLiveMinTime(minT)
    setLiveMaxTime(maxT)
  }, [dbDateDebut, dbDateFin])

  // Synchroniser les altitudes de filtrage client en direct avec les altitudes validées
  useEffect(() => {
    setLiveMinAlt(altFilterMin)
    setLiveMaxAlt(altFilterMax)
  }, [altFilterMin, altFilterMax])

  // Charger automatiquement les statistiques et les radars au changement de mode
  useEffect(() => {
    if (appMode === 'db') {
      void loadStats()
      void loadRadars()
    }
  }, [appMode, loadStats, loadRadars])

  // Charger automatiquement les emprises de la BDD au changement de mode, dates ou radars sélectionnés
  useEffect(() => {
    if (appMode === 'db') {
      void loadBoundingBoxes(
        dbDateDebut ? new Date(dbDateDebut + 'Z').toISOString() : null,
        dbDateFin ? new Date(dbDateFin + 'Z').toISOString() : null,
        selectedRadars.length > 0 ? selectedRadars : undefined,
      )
    }
  }, [appMode, dbDateDebut, dbDateFin, selectedRadars, loadBoundingBoxes])

  useEffect(() => {
    if (dbStats?.date_range) {
      setDbDateDebut(isoToDatetimeLocal(dbStats.date_range.min))
      setDbDateFin(isoToDatetimeLocal(dbStats.date_range.max))
    }
  }, [dbStats])

  // Charger les traces en mode BDD lorsque les vols sélectionnés, les dates, le filtre altitude ou les zones actives changent
  useEffect(() => {
    if (appMode === 'db' && dbViewMode === 'points') {
      const activeZones = zones.filter((z) => z.active).map((z) => z.zone)
      void loadTraces(
        selectedFlightIds,
        dbDateDebut ? new Date(dbDateDebut + 'Z').toISOString() : null,
        dbDateFin ? new Date(dbDateFin + 'Z').toISOString() : null,
        altFilterMin,
        altFilterMax,
        activeZones.length > 0 ? activeZones : null,
      )
    }
  }, [appMode, dbViewMode, selectedFlightIds, dbDateDebut, dbDateFin, altFilterMin, altFilterMax, zones, loadTraces])

  // ── Callbacks carte (stables via refs) ────────────────────────────────────
  const handleZoneAdd = useCallback((zone: Zone, leafletId: number) => {
    addZone(zone, leafletId)
  }, [addZone])

  const handleZoneRemove = useCallback((leafletId: number) => {
    removeZoneByLeafletId(leafletId)
  }, [removeZoneByLeafletId])

  const handleZoneEdit = useCallback((leafletId: number, zone: Zone) => {
    editZoneByLeafletId(leafletId, zone)
  }, [editZoneByLeafletId])

  // Pour ZoneManualForm : ajoute une zone sans leafletId (zone "virtuelle")
  const handleManualZoneAdd = useCallback((zone: ZoneRectangle) => {
    addZone(zone, undefined)
  }, [addZone])





  // ── Actions filtrage BDD ──────────────────────────────────────────────────
  const handleDbFilter = useCallback(() => {
    const activeZones = zones.filter((z) => z.active)
    const hasActiveZone = activeZones.length > 0
    const hasDates = !!dbDateDebut && !!dbDateFin
    const hasRadars = selectedRadars.length > 0
    if (!hasActiveZone && !hasDates && !hasRadars) return

    void applyDbFilter({
      date_debut: hasDates ? new Date(dbDateDebut + 'Z').toISOString() : undefined,
      date_fin: hasDates ? new Date(dbDateFin + 'Z').toISOString() : undefined,
      zones: activeZones.map((z) => z.zone),
      radars: hasRadars ? selectedRadars : [],
    })

    if (activeStatsZone) {
      void loadZoneStats(
        activeStatsZone.zone,
        hasDates ? new Date(dbDateDebut + 'Z').toISOString() : null,
        hasDates ? new Date(dbDateFin + 'Z').toISOString() : null,
        hasRadars ? selectedRadars : [],
        altFilterMin,
        altFilterMax,
      )
    }
  }, [applyDbFilter, zones, dbDateDebut, dbDateFin, selectedRadars, activeStatsZone, loadZoneStats, altFilterMin, altFilterMax])

  const handleDbExport = useCallback(() => {
    const activeZones = zones.filter((z) => z.active)
    const hasActiveZone = activeZones.length > 0
    const hasDates = !!dbDateDebut && !!dbDateFin
    if (!hasActiveZone && !hasDates) return

    void exportDb({
      date_debut: hasDates ? new Date(dbDateDebut + 'Z').toISOString() : undefined,
      date_fin: hasDates ? new Date(dbDateFin + 'Z').toISOString() : undefined,
      zones: activeZones.map((z) => z.zone),
    })
  }, [exportDb, zones, dbDateDebut, dbDateFin])

  const handleVisualizeSelected = useCallback((flightIds: string[]) => {
    setSelectedFlightIds(flightIds)
    setFilterResult({ count: flightIds.length, flight_ids: flightIds })
    setDbViewMode('points')
    setAppMode('db')
  }, [setSelectedFlightIds, setFilterResult])

  // ── Callback clic sur une zone dessinée (stats) ──────────────────────────
  const handleZoneClick = useCallback((zone: Zone, center: [number, number]) => {
    if (appMode !== 'db') return
    setActiveStatsZone({ zone, center })
    void loadZoneStats(
      zone,
      dbDateDebut ? new Date(dbDateDebut + 'Z').toISOString() : null,
      dbDateFin ? new Date(dbDateFin + 'Z').toISOString() : null,
      selectedRadars,
      altFilterMin,
      altFilterMax,
    )
  }, [appMode, loadZoneStats, dbDateDebut, dbDateFin, selectedRadars, altFilterMin, altFilterMax])

  const handleCloseStatsPopup = useCallback(() => {
    setActiveStatsZone(null)
  }, [])

  // ── Données filtrées BDD ─────────────────────────────────────────────────
  const highlightedIds = filterResult?.flight_ids ?? []
  const availableFlights = filterResult ? filterResult.flight_ids : []
  const displayedBoundingBoxes = filterResult
    ? boundingBoxes.filter((b) => selectedFlightIds.includes(b.properties.flight_id))
    : []
  const hasActiveZone = zones.some((z) => z.active)
  const hasDates = !!dbDateDebut && !!dbDateFin
  const canDbFilter = (hasActiveZone || hasDates || selectedRadars.length > 0) && dbFilterState !== 'loading'

  // Altitudes globales pour les sliders (issues des stats BDD)
  const altGlobalMin = dbStats?.alt_min ?? 0
  const altGlobalMax = dbStats?.alt_max ?? 50000

  // Bornes de temps sélectionnées pour le TimeRangeSlider (mode BDD)
  const dbSelMinTime = dbDateDebut 
    ? new Date(dbDateDebut + 'Z').getTime() 
    : (dbStats?.date_range ? new Date(dbStats.date_range.min).getTime() : new Date().setHours(0, 0, 0, 0) - 24 * 3600 * 1000)

  const dbSelMaxTime = dbDateFin 
    ? new Date(dbDateFin + 'Z').getTime() 
    : (dbStats?.date_range ? new Date(dbStats.date_range.max).getTime() : new Date().getTime())

  const handleTimeRangeChange = useCallback((newMin: number, newMax: number) => {
    setLiveMinTime(newMin)
    setLiveMaxTime(newMax)
  }, [])

  const handleTimeRangeCommit = useCallback((newMin: number, newMax: number) => {
    setDbDateDebut(isoToDatetimeLocal(new Date(newMin).toISOString()))
    setDbDateFin(isoToDatetimeLocal(new Date(newMax).toISOString()))
  }, [])

  const handleAltRangeChange = useCallback((newMin: number, newMax: number) => {
    setLiveMinAlt(newMin)
    setLiveMaxAlt(newMax)
  }, [])

  const handleAltRangeCommit = useCallback((newMin: number, newMax: number) => {
    setAltFilter(newMin, newMax)
  }, [setAltFilter])

  const handleResetDates = useCallback(() => {
    if (!dbStats?.date_range) return
    setDbDateDebut(isoToDatetimeLocal(dbStats.date_range.min))
    setDbDateFin(isoToDatetimeLocal(dbStats.date_range.max))
  }, [dbStats])

  const handleAnalyzeZone = useCallback((stats: ZoneStats) => {
    if (stats.ts_debut) {
      setDbDateDebut(isoToDatetimeLocal(stats.ts_debut))
    }
    if (stats.ts_fin) {
      setDbDateFin(isoToDatetimeLocal(stats.ts_fin))
    }
    if (stats.radars) {
      setSelectedRadars(stats.radars)
    }

    const newAltMin = stats.alt_min !== null ? stats.alt_min : altGlobalMin
    const newAltMax = stats.alt_max !== null ? stats.alt_max : altGlobalMax
    setAltFilter(newAltMin, newAltMax)

    if (stats.flight_ids) {
      setSelectedFlightIds(stats.flight_ids)
      setFilterResult({
        count: stats.flight_ids.length,
        flight_ids: stats.flight_ids,
      })
    }

    setDbViewMode('points')
    setActiveStatsZone(null)
  }, [altGlobalMin, altGlobalMax, setAltFilter, setSelectedFlightIds, setFilterResult, setDbViewMode])

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">

      {/* ════ HEADER ════════════════════════════════════════════════════════ */}
      <header className="shrink-0 flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-2xl">✈️</span>
          <div>
            <h1 className="text-lg font-bold text-white leading-none">POC Avions</h1>
            <p className="text-xs text-slate-400 mt-0.5">Filtrage de traces géolocalisées</p>
          </div>
        </div>

        {/* ── Toggle de mode ─────────────────────────────────────────────── */}
        <div className="flex items-center bg-slate-800 rounded-full p-1 gap-1 border border-slate-700 font-sans">
          <button
            id="btn-mode-db"
            onClick={() => setAppMode('db')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
              appMode === 'db'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🗄️ Mode BDD
          </button>
          <button
            id="btn-mode-db-manage"
            onClick={() => setAppMode('db_manage')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
              appMode === 'db_manage'
                ? 'bg-slate-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚙️ Gérer BDD
          </button>
        </div>
      </header>

      {/* ════ CORPS ═════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">
        {appMode === 'db_manage' ? (
          <DbManagementDashboard
            onVisualize={handleVisualizeSelected}
            onImportCsv={importCsv}
            importState={importState}
            importResult={importResult}
            dbError={dbError}
            dbStats={dbStats}
            dbDateDebut={dbDateDebut}
            dbDateFin={dbDateFin}
            setDbDateDebut={setDbDateDebut}
            setDbDateFin={setDbDateFin}
            handleResetDates={handleResetDates}
            altFilterMin={altFilterMin}
            altFilterMax={altFilterMax}
            setAltFilter={setAltFilter}
            selectedRadars={selectedRadars}
            setSelectedRadars={setSelectedRadars}
            availableRadars={availableRadars}
            radarsState={radarsState}
            zones={zones}
            removeZone={removeZone}
            reactivateZone={reactivateZone}
            deleteZonePermanently={deleteZonePermanently}
          />
        ) : (
          <>
            {/* ── Carte ────────────────────────────────────────────────────── */}
            <main className="flex-1 relative" style={{ minWidth: 0 }}>
               <MapView
                zones={zones}
                onZoneAdd={handleZoneAdd}
                onZoneRemove={handleZoneRemove}
                onZoneEdit={handleZoneEdit}
                onZoneLeafletIdUpdate={updateZoneLeafletId}
                boundingBoxes={displayedBoundingBoxes}
                highlightedFlightIds={highlightedIds}
                showBoundingBoxes={appMode === 'db' && dbViewMode === 'emprises'}
                appMode={appMode}
                dbTraces={dbTraces}
                selectedFlightIds={selectedFlightIds}
                showSegments={showSegments}
                onZoneClick={handleZoneClick}
                statsPopupPosition={activeStatsZone?.center || null}
                onCloseStatsPopup={handleCloseStatsPopup}
                zoneStats={zoneStats}
                zoneStatsLoading={zoneStatsState === 'loading'}
                zoneStatsError={zoneStatsState === 'error' ? dbError : null}
                activeStatsZone={activeStatsZone}
                onAnalyze={handleAnalyzeZone}
                liveMinTime={liveMinTime}
                liveMaxTime={liveMaxTime}
                liveMinAlt={liveMinAlt}
                liveMaxAlt={liveMaxAlt}
              />

              {/* Panneau de contrôle élargi (bottom drawer) */}
              {expandedSlider && (
                <div className="absolute bottom-4 left-4 right-4 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl animate-slide-up select-none">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {expandedSlider === 'time' ? '⏱️' : '🏔️'}
                      </span>
                      <h3 className="text-sm font-semibold text-white">
                        {expandedSlider === 'time' 
                          ? 'Ajustement de la plage temporelle (Haute Précision)' 
                          : 'Ajustement de la plage d\'altitude (Haute Précision)'}
                      </h3>
                    </div>
                    <button
                      onClick={() => setExpandedSlider(null)}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all active:scale-95"
                    >
                      ✓ Fermer (Valider)
                    </button>
                  </div>

                  <div className="px-4 py-3 bg-slate-950/40 rounded-xl border border-slate-800">
                    {expandedSlider === 'time' ? (
                      <TimeRangeSlider
                        valueMin={dbSelMinTime}
                        valueMax={dbSelMaxTime}
                        onChange={handleTimeRangeChange}
                        onCommit={handleTimeRangeCommit}
                      />
                    ) : (
                      <AltitudeRangeSlider
                        valueMin={altFilterMin ?? altGlobalMin}
                        valueMax={altFilterMax ?? altGlobalMax}
                        onChange={handleAltRangeChange}
                        onCommit={handleAltRangeCommit}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Badges overlay */}
              <div className="absolute top-4 right-4 z-[1000] pointer-events-none flex flex-col items-end gap-2">
                {zones.filter((z) => z.active).length > 0 && (
                  <span className="bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                    {zones.filter((z) => z.active).length} zone{zones.filter((z) => z.active).length > 1 ? 's' : ''} active{zones.filter((z) => z.active).length > 1 ? 's' : ''}
                  </span>
                )}
                {appMode === 'db' && bbState === 'success' && (
                  <span className="bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                    {boundingBoxes.length} emprise{boundingBoxes.length > 1 ? 's' : ''} en base
                  </span>
                )}
                {appMode === 'db' && filterResult && (
                  <span className="bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                    {filterResult.count} vol{filterResult.count > 1 ? 's' : ''} retenu{filterResult.count > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </main>

            {/* ── Panneau latéral ───────────────────────────────────────────── */}
            <aside className="w-80 xl:w-96 shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-y-auto font-sans">
              <div className="p-4 space-y-4 flex-1">



                {/* ══ MODE BDD ══════════════════════════════════════════════════ */}
                {appMode === 'db' && (
                  <>
                    {/* Import + Stats */}
                    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                      <DbConnector
                        onLoadEmprises={() => loadBoundingBoxes(
                          dbDateDebut ? new Date(dbDateDebut + 'Z').toISOString() : null,
                          dbDateFin ? new Date(dbDateFin + 'Z').toISOString() : null
                        )}
                        bbState={bbState}
                        dbStats={dbStats}
                        boundingBoxCount={boundingBoxes.length}
                      />
                    </div>

                    {/* Saisie manuelle de zones */}
                    <ZoneManualForm onZoneAdd={handleManualZoneAdd} />

                    {/* Dates */}
                    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-200">Plage de dates</h3>
                        {dbStats?.date_range && (
                          <button
                            type="button"
                            onClick={handleResetDates}
                            className="text-slate-400 hover:text-slate-200 text-xs transition-colors"
                            title="Réinitialiser aux bornes de la base"
                          >
                            ✕ Reset
                          </button>
                        )}
                      </div>

                      {/* Slider temporel */}
                      {expandedSlider === 'time' ? (
                        <div className="bg-slate-750/30 border border-dashed border-indigo-500/30 rounded-xl p-4 text-center animate-pulse">
                          <p className="text-xs text-indigo-400 font-medium">⏱️ Ajustement en cours en bas...</p>
                        </div>
                      ) : (
                        <div 
                          onClick={() => setExpandedSlider('time')}
                          className="cursor-pointer group relative hover:bg-slate-750/30 rounded-xl p-1 transition-all"
                          title="Cliquez pour agrandir au bas de l'écran"
                        >
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-700 text-slate-300 text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 z-10">
                            <span>Agrandir</span> <span>⤢</span>
                          </div>
                          <div className="pointer-events-none">
                            <TimeRangeSlider
                              valueMin={dbSelMinTime}
                              valueMax={dbSelMaxTime}
                              onChange={handleTimeRangeChange}
                              onCommit={handleTimeRangeCommit}
                            />
                          </div>
                        </div>
                      )}

                      {/* Saisie manuelle précise */}
                      <div className="border-t border-slate-700/60 pt-3">
                        <button
                          type="button"
                          onClick={() => setShowManualDates(!showManualDates)}
                          className="flex items-center justify-between w-full text-left text-xs text-slate-400 hover:text-slate-200 transition-colors select-none"
                        >
                          <span>Saisie précise (manuelle)</span>
                          <span className="text-[9px] transition-transform duration-200" style={{ transform: showManualDates ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                            ▼
                          </span>
                        </button>

                        {showManualDates && (
                          <div className="space-y-3 mt-3">
                            <label className="block">
                              <span className="text-[10px] text-slate-400 mb-1 block">Début</span>
                              <input
                                id="input-db-date-debut"
                                type="datetime-local"
                                value={dbDateDebut}
                                onChange={(e) => setDbDateDebut(e.target.value)}
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[10px] text-slate-400 mb-1 block">Fin</span>
                              <input
                                id="input-db-date-fin"
                                type="datetime-local"
                                value={dbDateFin}
                                onChange={(e) => setDbDateFin(e.target.value)}
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Filtre radar */}
                    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                      <RadarFilter
                        availableRadars={availableRadars}
                        selectedRadars={selectedRadars}
                        onChange={setSelectedRadars}
                        isLoading={radarsState === 'loading'}
                      />
                    </div>

                    {/* Filtre altitude */}
                    {altGlobalMin < altGlobalMax && (
                      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-200">Plage d'altitude</h3>
                          {(altFilterMin !== null || altFilterMax !== null) && (
                            <button
                              type="button"
                              onClick={() => setAltFilter(null, null)}
                              className="text-slate-400 hover:text-slate-200 text-xs transition-colors"
                              title="Réinitialiser le filtre altitude"
                            >
                              ✕ Reset
                            </button>
                          )}
                        </div>
                        {expandedSlider === 'altitude' ? (
                          <div className="bg-slate-750/30 border border-dashed border-emerald-500/30 rounded-xl p-4 text-center animate-pulse">
                            <p className="text-xs text-emerald-400 font-medium">🏔️ Ajustement en cours en bas...</p>
                          </div>
                        ) : (
                          <div 
                            onClick={() => setExpandedSlider('altitude')}
                            className="cursor-pointer group relative hover:bg-slate-750/30 rounded-xl p-1 transition-all"
                            title="Cliquez pour agrandir au bas de l'écran"
                          >
                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-700 text-slate-300 text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 z-10">
                              <span>Agrandir</span> <span>⤢</span>
                            </div>
                            <div className="pointer-events-none">
                              <AltitudeRangeSlider
                                valueMin={altFilterMin ?? altGlobalMin}
                                valueMax={altFilterMax ?? altGlobalMax}
                                onChange={handleAltRangeChange}
                                onCommit={handleAltRangeCommit}
                              />
                            </div>
                          </div>
                        )}

                        {/* Saisie manuelle altitude */}
                        <div className="border-t border-slate-700/60 pt-3">
                          <button
                            type="button"
                            onClick={() => setShowManualAlt(!showManualAlt)}
                            className="flex items-center justify-between w-full text-left text-xs text-slate-400 hover:text-slate-200 transition-colors select-none"
                          >
                            <span>Saisie précise (manuelle)</span>
                            <span className="text-[9px] transition-transform duration-200" style={{ transform: showManualAlt ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                              ▼
                            </span>
                          </button>

                          {showManualAlt && (
                            <div className="space-y-3 mt-3">
                              <label className="block">
                                <span className="text-[10px] text-slate-400 mb-1 block">Altitude Min (ft)</span>
                                <input
                                  type="number"
                                  value={altFilterMin !== null ? altFilterMin : ''}
                                  placeholder={altGlobalMin.toString()}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? null : Number(e.target.value)
                                    setAltFilter(val, altFilterMax)
                                  }}
                                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[10px] text-slate-400 mb-1 block">Altitude Max (ft)</span>
                                <input
                                  type="number"
                                  value={altFilterMax !== null ? altFilterMax : ''}
                                  placeholder={altGlobalMax.toString()}
                                  onChange={(e) => {
                                    const val = e.target.value === '' ? null : Number(e.target.value)
                                    setAltFilter(altFilterMin, val)
                                  }}
                                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Zones actives */}
                    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-200">Zones actives</h3>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${zones.filter((z) => z.active).length > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                          {zones.filter((z) => z.active).length}
                        </span>
                      </div>
                      {zones.filter((z) => z.active).length === 0 ? (
                        <p className="text-slate-500 text-xs italic">Dessinez ou saisissez des zones</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {zones
                            .filter((z) => z.active)
                            .map((zw, i) => (
                              <li key={zw.id} className="flex items-center justify-between bg-slate-700/60 rounded-lg px-3 py-2">
                                <span className="text-slate-300 text-xs truncate" title={zw.zone.nom || `Zone #${i + 1}`}>
                                  {zw.zone.type === 'rectangle' ? '▭' : '◯'} {zw.zone.nom || `Zone #${i + 1}`}
                                </span>
                                <button
                                  onClick={() => removeZone(zw.id)}
                                  className="text-slate-500 hover:text-red-400 transition-colors text-xs ml-2"
                                  title="Désactiver"
                                >✕</button>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>

                    {/* Historique / Zones inactives BDD */}
                    {zones.some((z) => !z.active) && (
                      <div className="bg-slate-850/50 rounded-xl border border-slate-800 p-4 space-y-2">
                        <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                          Zones désactivées (Historique)
                        </h4>
                        <ul className="space-y-1.5">
                          {zones
                            .filter((z) => !z.active)
                            .map((zw, i) => (
                              <li
                                key={zw.id}
                                className="flex items-center justify-between bg-slate-800/40 border border-slate-800/60 rounded-lg px-3 py-2 opacity-70"
                              >
                                <span className="text-slate-400 text-xs truncate" title={zw.zone.nom || `${zw.zone.type === 'rectangle' ? 'Rectangle' : 'Cercle'} #${i + 1}`}>
                                  {zw.zone.type === 'rectangle' ? '▭' : '◯'} {zw.zone.nom || `Zone #${i + 1}`}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => reactivateZone(zw.id)}
                                    className="text-emerald-500 hover:text-emerald-400 font-semibold text-xs transition-colors"
                                  >
                                    Réactiver
                                  </button>
                                  <button
                                    onClick={() => deleteZonePermanently(zw.id)}
                                    className="text-slate-500 hover:text-red-400 text-xs transition-colors"
                                    title="Supprimer définitivement"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}

                    {/* Bouton filtrer BDD */}
                    <button
                      id="btn-db-filter"
                      onClick={handleDbFilter}
                      disabled={!canDbFilter}
                      className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                        canDbFilter
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg active:scale-[0.98]'
                          : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {dbFilterState === 'loading' ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Filtrage…
                        </span>
                      ) : '🔍 Filtrer les emprises'}
                    </button>

                    {/* Résultat filtrage BDD */}
                    {filterResult && (
                      <div className="bg-emerald-900/40 border border-emerald-700 rounded-xl p-3">
                        <p className="text-emerald-300 text-sm font-semibold">
                          {filterResult.count} vol{filterResult.count > 1 ? 's' : ''} retenu{filterResult.count > 1 ? 's' : ''}
                        </p>
                        <p className="text-emerald-200/60 text-xs mt-0.5">
                          Emprises surlignées sur la carte
                        </p>
                      </div>
                    )}

                    {/* Erreur BDD */}
                    {dbError && dbFilterState === 'error' && (
                      <div className="bg-red-950/50 border border-red-700 rounded-xl p-3">
                        <p className="text-red-300 text-xs">{dbError}</p>
                      </div>
                    )}

                    {/* Toggle Points / Emprises */}
                    {bbState === 'success' && (
                      <div className="flex items-center bg-slate-800 rounded-full p-1 border border-slate-700">
                        <button
                          id="btn-view-emprises"
                          onClick={() => setDbViewMode('emprises')}
                          className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition-all ${
                            dbViewMode === 'emprises' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          🗺️ Emprises
                        </button>
                        <button
                          id="btn-view-points"
                          onClick={() => setDbViewMode('points')}
                          className={`flex-1 py-1.5 rounded-full text-xs font-semibold transition-all ${
                            dbViewMode === 'points' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          📍 Points
                        </button>
                      </div>
                    )}

                    {/* Trajectoires/Emprises et sélection de vols */}
                    {bbState === 'success' && filterResult !== null && (
                      <>
                        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-4 shadow-md">
                          <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                            <h3 className="text-sm font-semibold text-white">
                              {dbViewMode === 'points' ? 'Trajectoires & Vols' : 'Emprises & Vols'}
                            </h3>
                            {tracesState === 'loading' && (
                              <span className="w-3 h-3 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                            )}
                          </div>

                          {/* Checkbox tracer les segments (uniquement en mode Points) */}
                          {dbViewMode === 'points' && (
                            <label className="flex items-center gap-3 cursor-pointer select-none group">
                              <input
                                type="checkbox"
                                checked={showSegments}
                                onChange={(e) => setShowSegments(e.target.checked)}
                                className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700 focus:ring-emerald-500 focus:ring-offset-slate-800 focus:ring-2 cursor-pointer transition"
                              />
                              <span className="text-sm text-slate-300 group-hover:text-slate-100 transition">Tracer les segments (lignes)</span>
                            </label>
                          )}

                          {/* Liste de vols */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-slate-400">
                              <span>Vols ({availableFlights.length})</span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedFlightIds(availableFlights)}
                                  className="text-emerald-400 hover:text-emerald-300 font-semibold transition"
                                >
                                  Tout cocher
                                </button>
                                <span className="text-slate-600">|</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedFlightIds([])}
                                  className="text-emerald-400 hover:text-emerald-300 font-semibold transition"
                                >
                                  Tout décocher
                                </button>
                              </div>
                            </div>

                            {availableFlights.length === 0 ? (
                              <p className="text-slate-500 text-xs italic">Aucun vol disponible.</p>
                            ) : (
                              <div className="max-h-48 overflow-y-auto space-y-1 pr-1 border border-slate-700 rounded-lg p-2 bg-slate-900/40">
                                {availableFlights.map((flightId) => {
                                  const isChecked = selectedFlightIds.includes(flightId)
                                  const color = flightColor(flightId)
                                  return (
                                    <label
                                      key={flightId}
                                      className="flex items-center justify-between hover:bg-slate-800/40 rounded px-2 py-1 cursor-pointer transition"
                                    >
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => {
                                            if (isChecked) {
                                              setSelectedFlightIds(selectedFlightIds.filter((id) => id !== flightId))
                                            } else {
                                              setSelectedFlightIds([...selectedFlightIds, flightId])
                                            }
                                          }}
                                          className="w-3.5 h-3.5 rounded text-emerald-600 bg-slate-900 border-slate-700 focus:ring-emerald-500 focus:ring-offset-slate-900 focus:ring-2 cursor-pointer"
                                        />
                                        <span className="text-xs font-mono text-slate-300">{flightId}</span>
                                      </div>
                                      <span
                                        className="w-2.5 h-2.5 rounded-full border border-white/20"
                                        style={{ backgroundColor: color }}
                                      />
                                    </label>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Export BDD */}
                        {filterResult && filterResult.count > 0 && (
                          <button
                            id="btn-db-export"
                            onClick={handleDbExport}
                            disabled={exportState === 'loading'}
                            className="w-full py-3 rounded-xl font-semibold text-sm bg-orange-700 hover:bg-orange-600 text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                          >
                            {exportState === 'loading' ? (
                              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Export…</>
                            ) : (
                              <>⬇ Exporter CSV ({filterResult.count} vol{filterResult.count > 1 ? 's' : ''}, traces complètes)</>
                            )}
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

          {/* Footer */}
          <div className="shrink-0 p-4 border-t border-slate-800">
            <p className="text-xs text-slate-600 text-center">
              Phase 3 — {appMode === 'db' ? 'Mode Base de Données PostGIS' : 'Gestion de la Base de Données'}
            </p>
          </div>
        </aside>
          </>
        )}
      </div>
    </div>
  )
}
