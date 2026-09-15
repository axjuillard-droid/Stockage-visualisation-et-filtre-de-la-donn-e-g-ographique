/**
 * Hook personnalisé pour gérer l'état local du tableau de bord "Gérer BDD".
 * Gère le chargement, la recherche paginée, la sélection de vols, la suppression et la purge.
 */

import { useCallback, useEffect, useState } from 'react'
import type { DbFlightStats } from '../types'
import { deleteFlightsManagement, getFlightsManagement, purgeDb } from '../lib/api'

interface UseDbManagementReturn {
  flights: DbFlightStats[]
  totalCount: number
  query: string
  page: number
  limit: number
  selectedFlightIds: string[]
  isLoading: boolean
  errorMessage: string | null

  setQuery: (q: string) => void
  setPage: (p: number) => void
  setSelectedFlightIds: React.Dispatch<React.SetStateAction<string[]>>

  loadFlights: () => Promise<void>
  deleteSelected: () => Promise<void>
  purgeAll: () => Promise<void>
  resetSelection: () => void
}

interface UseDbManagementFilters {
  date_debut?: string | null
  date_fin?: string | null
  alt_min?: number | null
  alt_max?: number | null
  radars?: string[]
  zones?: any[]
}

export function useDbManagement(filters?: UseDbManagementFilters): UseDbManagementReturn {
  const [flights, setFlights] = useState<DbFlightStats[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const limit = 10
  const [selectedFlightIds, setSelectedFlightIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const filterKey = JSON.stringify(filters)

  const loadFlights = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const offset = (page - 1) * limit
      const data = await getFlightsManagement(query, limit, offset, filters)
      setFlights(data.flights)
      setTotalCount(data.total_count)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur de chargement des vols')
    } finally {
      setIsLoading(false)
    }
  }, [query, page, filterKey])

  const deleteSelected = useCallback(async () => {
    if (selectedFlightIds.length === 0) return
    setIsLoading(true)
    setErrorMessage(null)
    try {
      await deleteFlightsManagement(selectedFlightIds)
      setSelectedFlightIds([])
      setPage(1)
      await loadFlights()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur lors de la suppression')
      setIsLoading(false)
    }
  }, [selectedFlightIds, loadFlights])

  const purgeAll = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      await purgeDb()
      setSelectedFlightIds([])
      setPage(1)
      setFlights([])
      setTotalCount(0)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erreur lors de la purge')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const resetSelection = useCallback(() => {
    setSelectedFlightIds([])
  }, [])

  // Déclencher le chargement automatique à chaque changement de page ou de recherche
  useEffect(() => {
    void loadFlights()
  }, [loadFlights])

  // Repositionner sur la première page lors d'une nouvelle recherche
  useEffect(() => {
    setPage(1)
  }, [query])

  return {
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
    resetSelection,
  }
}
