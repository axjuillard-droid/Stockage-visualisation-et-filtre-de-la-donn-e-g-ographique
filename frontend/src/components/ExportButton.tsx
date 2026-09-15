/**
 * ExportButton — Bouton de téléchargement du CSV filtré.
 * Visible uniquement après un filtrage réussi.
 */

interface ExportButtonProps {
  filteredBlob: Blob | null
  filteredCount: number | null
}

/**
 * Déclenche le téléchargement du CSV filtré en créant un lien temporaire.
 *
 * @param filteredBlob  - Blob CSV à télécharger
 * @param filteredCount - Nombre de traces (affiché dans le label)
 */
export function ExportButton({ filteredBlob, filteredCount }: ExportButtonProps) {
  if (!filteredBlob) return null

  const handleDownload = () => {
    const url = URL.createObjectURL(filteredBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `filtered_traces_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    // Libérer la mémoire après un court délai
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <button
      id="btn-export-csv"
      onClick={handleDownload}
      className="
        w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200
        bg-emerald-700 hover:bg-emerald-600 text-white
        shadow-lg shadow-emerald-900/30 active:scale-[0.98]
        flex items-center justify-center gap-2
      "
    >
      <span>⬇</span>
      <span>
        Exporter CSV
        {filteredCount !== null && (
          <span className="font-normal text-emerald-200 ml-1">
            ({filteredCount.toLocaleString()} traces)
          </span>
        )}
      </span>
    </button>
  )
}
