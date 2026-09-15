/**
 * Hook pour gérer les zones dessinées sur la carte.
 * Fournit l'état des zones et les fonctions CRUD.
 */

import { useCallback, useState } from 'react'
import type { Zone, ZoneWithId } from '../types'

let _idCounter = 0

function generateId(): string {
  return `zone-${++_idCounter}-${Date.now()}`
}

export interface UseMapZonesReturn {
  /** Liste des zones actives et inactives */
  zones: ZoneWithId[]
  /** Ajoute une zone dessinée */
  addZone: (zone: Zone, leafletId?: number) => ZoneWithId
  /** Désactive une zone (l'envoie dans l'historique) */
  removeZone: (id: string) => void
  /** Désactive une zone par son leafletId */
  removeZoneByLeafletId: (leafletId: number) => void
  /** Réactive une zone inactive (nettoie le leafletId pour rendu React) */
  reactivateZone: (id: string) => void
  /** Supprime définitivement une zone de l'état */
  deleteZonePermanently: (id: string) => void
  /** Met à jour la géométrie d'une zone après édition leaflet-draw */
  editZoneByLeafletId: (leafletId: number, zone: Zone) => void
  /** Met à jour le leafletId d'une zone */
  updateZoneLeafletId: (id: string, leafletId: number) => void
  /** Vide toutes les zones */
  clearZones: () => void
}

/**
 * Gère l'état des zones géographiques dessinées sur la carte.
 * Supporte le cycle de vie : active → inactive (historique) → réactivée/supprimée.
 */
export function useMapZones(): UseMapZonesReturn {
  const [zones, setZones] = useState<ZoneWithId[]>([])

  const addZone = useCallback((zone: Zone, leafletId?: number): ZoneWithId => {
    const id = generateId()
    const nextIndex = zones.length + 1
    const defaultName = zone.type === 'rectangle' ? `Rectangle #${nextIndex}` : `Cercle #${nextIndex}`
    const zoneWithName: Zone = {
      ...zone,
      nom: zone.nom?.trim() || defaultName
    }
    const newZone: ZoneWithId = { id, zone: zoneWithName, leafletId, active: true }
    setZones((prev) => [...prev, newZone])
    return newZone
  }, [zones.length])

  // removeZone désactive la zone au lieu de la détruire (la met dans l'historique)
  const removeZone = useCallback((id: string): void => {
    setZones((prev) =>
      prev.map((z) => (z.id === id ? { ...z, active: false } : z))
    )
  }, [])

  // Désactive via l'outil de suppression Leaflet.draw
  const removeZoneByLeafletId = useCallback((leafletId: number): void => {
    setZones((prev) =>
      prev.map((z) => (z.leafletId === leafletId ? { ...z, active: false } : z))
    )
  }, [])

  const reactivateZone = useCallback((id: string): void => {
    setZones((prev) =>
      prev.map((z) =>
        z.id === id ? { ...z, active: true, leafletId: undefined } : z
      )
    )
  }, [])

  const deleteZonePermanently = useCallback((id: string): void => {
    setZones((prev) => prev.filter((z) => z.id !== id))
  }, [])

  // Met à jour la géométrie d'une zone après édition leaflet-draw
  const editZoneByLeafletId = useCallback((leafletId: number, updatedZone: Zone): void => {
    setZones((prev) =>
      prev.map((z) => (z.leafletId === leafletId ? { ...z, zone: updatedZone } : z))
    )
  }, [])

  const updateZoneLeafletId = useCallback((id: string, leafletId: number): void => {
    setZones((prev) =>
      prev.map((z) => (z.id === id ? { ...z, leafletId } : z))
    )
  }, [])

  const clearZones = useCallback((): void => {
    setZones([])
  }, [])

  return {
    zones,
    addZone,
    removeZone,
    removeZoneByLeafletId,
    reactivateZone,
    deleteZonePermanently,
    editZoneByLeafletId,
    updateZoneLeafletId,
    clearZones,
  }
}
