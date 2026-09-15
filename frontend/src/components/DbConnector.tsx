/**
 * DbConnector — Affichage des stats de la BDD et chargement des emprises.
 */

import type { DbStats } from '../types'

interface DbConnectorProps {
  onLoadEmprises: () => Promise<void>
  bbState: 'idle' | 'loading' | 'success' | 'error'
  dbStats: DbStats | null
  boundingBoxCount: number
}

export function DbConnector({
  onLoadEmprises,
  bbState,
  dbStats,
  boundingBoxCount,
}: DbConnectorProps) {
  return (
    <div className="space-y-3">
      {/* ── Header section ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <h3 className="text-sm font-semibold text-slate-200">Base de Données</h3>
      </div>

      {/* ── Stats si disponibles ────────────────────────────────────────── */}
      {dbStats && dbStats.total_traces > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-700/60 rounded-lg p-2.5">
            <div className="text-slate-400 text-xs mb-0.5">Traces</div>
            <div className="text-white font-bold">{dbStats.total_traces.toLocaleString()}</div>
          </div>
          <div className="bg-slate-700/60 rounded-lg p-2.5">
            <div className="text-slate-400 text-xs mb-0.5">Vols</div>
            <div className="text-white font-bold">{dbStats.total_flights.toLocaleString()}</div>
          </div>
          {dbStats.date_range && (
            <div className="col-span-2 bg-slate-700/60 rounded-lg p-2.5 text-xs">
              <div className="text-slate-400 mb-1">Plage de données</div>
              <div className="text-slate-200">
                {new Date(dbStats.date_range.min).toLocaleDateString('fr-FR')}
                {' → '}
                {new Date(dbStats.date_range.max).toLocaleDateString('fr-FR')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bouton charger les emprises ────────────────────────────────── */}
      {dbStats && dbStats.total_traces > 0 && (
        <button
          id="btn-load-emprises"
          onClick={() => void onLoadEmprises()}
          disabled={bbState === 'loading'}
          className={`
            w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
            ${bbState === 'loading'
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : 'bg-emerald-700 hover:bg-emerald-600 text-white active:scale-[0.98]'
            }
            flex items-center justify-center gap-2
          `}
        >
          {bbState === 'loading' ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Chargement…
            </>
          ) : bbState === 'success' ? (
            `↻ Actualiser les emprises (${boundingBoxCount})`
          ) : (
            '🗺️ Charger les emprises'
          )}
        </button>
      )}
    </div>
  )
}
