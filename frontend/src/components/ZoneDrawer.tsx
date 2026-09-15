/**
 * ZoneDrawer — Intègre Leaflet.draw dans la carte react-leaflet.
 *
 * Corrections v2 :
 * - Callbacks stabilisés via useRef → drawControl ne se recrée plus à chaque zone
 * - Écoute draw:edited → zones actives mises à jour après modification
 * - Écoute draw:deleted → zones retirées du state
 */

import { useEffect, useRef, useState, Fragment } from 'react'
import { useMap, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet-draw'
import type { Zone, ZoneWithId, ZoneRectangle } from '../types'

// Monkey-patch Leaflet.draw's L.Draw.SimpleShape to fix click-drag-release drawing in Leaflet 1.9+.
// Leaflet 1.9+ pointer capture prevents document-level mouseup/touchend from firing.
// Adding mouseup/touchend listeners directly on the map solves this.
const SimpleShape = (L as any).Draw?.SimpleShape;
if (SimpleShape) {
  const originalOnMouseDown = SimpleShape.prototype._onMouseDown;
  const originalRemoveHooks = SimpleShape.prototype.removeHooks;

  SimpleShape.prototype._onMouseDown = function (e: any) {
    originalOnMouseDown.call(this, e);

    this._mapMouseUpListener = (mapEvent: any) => {
      this._onMouseUp(mapEvent.originalEvent);
    };

    this._map.on('mouseup', this._mapMouseUpListener, this);
    this._map.on('touchend', this._mapMouseUpListener, this);
  };

  SimpleShape.prototype.removeHooks = function () {
    originalRemoveHooks.call(this);

    if (this._map && this._mapMouseUpListener) {
      this._map.off('mouseup', this._mapMouseUpListener, this);
      this._map.off('touchend', this._mapMouseUpListener, this);
      this._mapMouseUpListener = null;
    }
  };
}

// Monkey-patch L.GeometryUtil.readableArea to fix ReferenceError: type is not defined in strict mode (Vite/ES6).
const GeometryUtil = (L as any).GeometryUtil;
if (GeometryUtil) {
  GeometryUtil.readableArea = function (area: number, isMetric: boolean, precision: any) {
    var areaStr,
      units,
      precisionVal = L.Util.extend({}, { km: 2, ha: 2, m: 0, mi: 2, ac: 2, yd: 0, ft: 0 }, precision);

    if (isMetric) {
      units = ['ha', 'm'];
      var type = typeof isMetric;
      if (type === 'string') {
        units = [isMetric as any];
      } else if (type !== 'boolean') {
        units = isMetric as any;
      }

      if (area >= 1000000 && units.indexOf('km') !== -1) {
        areaStr = GeometryUtil.formattedNumber(area * 0.000001, precisionVal['km']) + ' km²';
      } else if (area >= 10000 && units.indexOf('ha') !== -1) {
        areaStr = GeometryUtil.formattedNumber(area * 0.0001, precisionVal['ha']) + ' ha';
      } else {
        areaStr = GeometryUtil.formattedNumber(area, precisionVal['m']) + ' m²';
      }
    } else {
      area /= 0.836127; // Square yards in 1 meter

      if (area >= 3097600) { // 3097600 square yards in 1 square mile
        areaStr = GeometryUtil.formattedNumber(area / 3097600, precisionVal['mi']) + ' mi²';
      } else if (area >= 4840) { // 4840 square yards in 1 acre
        areaStr = GeometryUtil.formattedNumber(area / 4840, precisionVal['ac']) + ' ac';
      } else {
        areaStr = GeometryUtil.formattedNumber(area, precisionVal['yd']) + ' yd²';
      }
    }

    return areaStr;
  };
}

// Monkey-patch L.Edit.Circle.prototype._resize to fix ReferenceError: radius is not defined in strict mode.
const EditCircle = (L as any).Edit?.Circle;
if (EditCircle) {
  EditCircle.prototype._resize = function (latlng: any) {
    var moveLatLng = this._moveMarker.getLatLng();
    var radius: number;

    // Calculate the radius based on the version
    if (L.GeometryUtil.isVersion07x()) {
      radius = moveLatLng.distanceTo(latlng);
    } else {
      radius = this._map.distance(moveLatLng, latlng);
    }

    this._shape.setRadius(radius);

    if (this._map.editTooltip) {
      this._map._editTooltip.updateContent({
        text: L.drawLocal.edit.handlers.edit.tooltip.subtext + '<br />' + L.drawLocal.edit.handlers.edit.tooltip.text,
        subtext: L.drawLocal.draw.handlers.circle.radius + ': ' +
          L.GeometryUtil.readableDistance(radius, true, this.options.feet, this.options.nautic)
      });
    }

    this._shape.setRadius(radius);

    this._map.fire(L.Draw.Event.EDITRESIZE, { layer: this._shape });
  };
}




const rotateIcon = L.divIcon({
  html: `
    <div class="flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 border border-slate-700 shadow-xl hover:border-indigo-500 hover:scale-105 active:scale-95 transition-all text-indigo-400 cursor-pointer pointer-events-auto" title="Pivoter le rectangle">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4.5 h-4.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    </div>
  `,
  className: 'custom-rotate-icon-container',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

const moveIcon = L.divIcon({
  html: `
    <div class="flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 border border-slate-700 shadow-xl hover:border-emerald-500 hover:scale-105 active:scale-95 transition-all text-emerald-400 cursor-move pointer-events-auto" title="Déplacer le rectangle">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" class="w-4.5 h-4.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9M20.25 20.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
      </svg>
    </div>
  `,
  className: 'custom-move-icon-container',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
})

const cornerNwseIcon = L.divIcon({
  html: `
    <div class="w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-sm shadow-md hover:scale-125 transition-transform cursor-nwse-resize pointer-events-auto"></div>
  `,
  className: 'custom-corner-icon-container',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

const cornerNeswIcon = L.divIcon({
  html: `
    <div class="w-3.5 h-3.5 bg-white border-2 border-indigo-600 rounded-sm shadow-md hover:scale-125 transition-transform cursor-nesw-resize pointer-events-auto"></div>
  `,
  className: 'custom-corner-icon-container',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

function getRectangleVertices(zone: ZoneRectangle): [number, number][] {
  const { lat_min, lat_max, lon_min, lon_max, rotation = 0 } = zone
  const latCenter = (lat_min + lat_max) / 2
  const lonCenter = (lon_min + lon_max) / 2

  const corners: [number, number][] = [
    [lat_max, lon_min], // top-left
    [lat_max, lon_max], // top-right
    [lat_min, lon_max], // bottom-right
    [lat_min, lon_min], // bottom-left
  ]

  if (!rotation) return corners

  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  return corners.map(([lat, lon]) => {
    const dy = lat - latCenter
    const dx = lon - lonCenter
    const rotLon = lonCenter + dx * cos - dy * sin
    const rotLat = latCenter + dx * sin + dy * cos
    return [rotLat, rotLon]
  })
}

interface ZoneDrawerProps {
  /** Liste complète des zones */
  zones: ZoneWithId[]
  /** Appelé quand l'utilisateur finit de dessiner une zone */
  onZoneAdd: (zone: Zone, leafletId: number) => void
  /** Appelé quand l'utilisateur supprime une zone via l'outil édition */
  onZoneRemove: (leafletId: number) => void
  /** Appelé quand l'utilisateur modifie une zone via l'outil édition */
  onZoneEdit: (leafletId: number, zone: Zone) => void
  /** Appelé pour associer un leafletId généré à une zone créée manuellement/réactivée */
  onZoneLeafletIdUpdate: (id: string, leafletId: number) => void
  /** Appelé quand l'utilisateur clique sur le corps d'une zone (rectangle ou cercle). Optionnel. */
  onZoneClick?: (zone: Zone, center: [number, number]) => void
}

/**
 * Extrait une Zone à partir d'un layer Leaflet.
 * Retourne null si le type n'est pas supporté.
 */
function layerToZone(layer: L.Layer): Zone | null {
  if (layer instanceof L.Rectangle) {
    const bounds = layer.getBounds()
    return {
      type: 'rectangle',
      lat_min: bounds.getSouth(),
      lat_max: bounds.getNorth(),
      lon_min: bounds.getWest(),
      lon_max: bounds.getEast(),
      rotation: 0,
    }
  }
  if (layer instanceof L.Polygon && !(layer instanceof L.Rectangle)) {
    const latlngs = layer.getLatLngs() as L.LatLng[][] | L.LatLng[]
    const points = Array.isArray(latlngs[0]) ? (latlngs[0] as L.LatLng[]) : (latlngs as L.LatLng[])
    if (points.length >= 4) {
      // points: top-left (0), top-right (1), bottom-right (2), bottom-left (3)
      const p0 = points[0]
      const p2 = points[2]
      const p3 = points[3]

      // Center
      const latCenter = (p0.lat + p2.lat) / 2
      const lonCenter = (p0.lng + p2.lng) / 2

      // Angle of bottom edge (p3 to p2)
      const dy = p2.lat - p3.lat
      const dx = p2.lng - p3.lng
      const rad = Math.atan2(dy, dx)
      const rotation = (rad * 180) / Math.PI

      // Rotate points back by -rotation around the center
      const cos = Math.cos(-rad)
      const sin = Math.sin(-rad)

      const unrot = points.map((p) => {
        const dy = p.lat - latCenter
        const dx = p.lng - lonCenter
        const unrotLon = lonCenter + dx * cos - dy * sin
        const unrotLat = latCenter + dx * sin + dy * cos
        return L.latLng(unrotLat, unrotLon)
      })

      const lats = unrot.map((p) => p.lat)
      const lons = unrot.map((p) => p.lng)

      return {
        type: 'rectangle',
        lat_min: Math.min(...lats),
        lat_max: Math.max(...lats),
        lon_min: Math.min(...lons),
        lon_max: Math.max(...lons),
        rotation: Math.round(rotation),
      }
    }
  }
  if (layer instanceof L.Circle) {
    const center = layer.getLatLng()
    return {
      type: 'cercle',
      lat: center.lat,
      lon: center.lng,
      rayon_km: layer.getRadius() / 1000,
    }
  }
  return null
}

/**
 * Composant enfant de MapContainer.
 *
 * IMPORTANT : les callbacks (onZoneAdd, onZoneRemove, onZoneEdit) sont
 * stockés dans des refs pour que le useEffect principal ne se ré-exécute
 * jamais — le drawControl est créé UNE SEULE FOIS par montage de carte.
 */
export function ZoneDrawer({ zones, onZoneAdd, onZoneRemove, onZoneEdit, onZoneLeafletIdUpdate, onZoneClick }: ZoneDrawerProps) {
  const map = useMap()
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const isEditingRef = useRef(false)
  useEffect(() => {
    isEditingRef.current = isEditing
  }, [isEditing])

  const attachCustomEditing = (layer: L.Layer) => {
    if (layer instanceof L.Polygon && !(layer instanceof L.Rectangle)) {
      ;(layer as any).editing = {
        enable: () => {
          setIsEditing(true)
        },
        disable: () => {
          setIsEditing(false)
        },
        enabled: () => {
          return isEditingRef.current
        },
      }
    }
  }

  // ─── Refs stables pour les callbacks ────────────────────────────────────────
  // Permet de mettre à jour les callbacks sans re-créer le drawControl
  const onZoneAddRef = useRef(onZoneAdd)
  const onZoneRemoveRef = useRef(onZoneRemove)
  const onZoneEditRef = useRef(onZoneEdit)
  const onZoneLeafletIdUpdateRef = useRef(onZoneLeafletIdUpdate)
  const onZoneClickRef = useRef(onZoneClick)

  // Synchronise les refs à chaque render (sans déclencher l'effect)
  useEffect(() => { onZoneAddRef.current = onZoneAdd }, [onZoneAdd])
  useEffect(() => { onZoneRemoveRef.current = onZoneRemove }, [onZoneRemove])
  useEffect(() => { onZoneEditRef.current = onZoneEdit }, [onZoneEdit])
  useEffect(() => { onZoneLeafletIdUpdateRef.current = onZoneLeafletIdUpdate }, [onZoneLeafletIdUpdate])
  useEffect(() => { onZoneClickRef.current = onZoneClick }, [onZoneClick])

  const zonesRef = useRef(zones)
  useEffect(() => { zonesRef.current = zones }, [zones])

  // Synchronise les couches Leaflet.draw avec l'état externe des zones actives
  useEffect(() => {
    const drawnItems = drawnItemsRef.current
    if (!drawnItems) return

    // 1. Supprimer du FeatureGroup les couches qui ne sont plus dans les zones actives
    drawnItems.eachLayer((layer) => {
      const leafletId = drawnItems.getLayerId(layer)
      const isStillActive = zones.some((z) => z.leafletId === leafletId && z.active)
      if (!isStillActive) {
        drawnItems.removeLayer(layer)
      }
    })

    // 2. Ajouter au FeatureGroup les zones actives qui n'y sont pas encore ou les mettre à jour
    zones.forEach((z) => {
      if (!z.active) return

      let exists = false
      let existingLayer: L.Layer | undefined = undefined
      if (z.leafletId !== undefined) {
        existingLayer = drawnItems.getLayer(z.leafletId)
        exists = !!existingLayer
      }

      if (!exists) {
        let layer: L.Layer | null = null
        if (z.zone.type === 'rectangle') {
          layer = L.polygon(
            getRectangleVertices(z.zone as ZoneRectangle),
            {
              color: '#6366f1',
              fillColor: '#6366f1',
              fillOpacity: 0.15,
              weight: 2,
            }
          )
          attachCustomEditing(layer)
          attachClickHandler(layer)
        } else if (z.zone.type === 'cercle') {
          layer = L.circle(
            [z.zone.lat, z.zone.lon],
            {
              radius: z.zone.rayon_km * 1000,
              color: '#6366f1',
              fillColor: '#6366f1',
              fillOpacity: 0.15,
              weight: 2,
            }
          )
          attachClickHandler(layer)
        }

        if (layer) {
          drawnItems.addLayer(layer)
          const newLeafletId = drawnItems.getLayerId(layer)
          onZoneLeafletIdUpdateRef.current(z.id, newLeafletId)
        }
      } else if (existingLayer) {
        // Met à jour la géométrie et le type de couche selon le mode d'édition
        if (z.zone.type === 'rectangle') {
          if (existingLayer instanceof L.Rectangle) {
            drawnItems.removeLayer(existingLayer)
            const poly = L.polygon(
              getRectangleVertices(z.zone as ZoneRectangle),
              {
                color: '#6366f1',
                fillColor: '#6366f1',
                fillOpacity: 0.15,
                weight: 2,
              }
            )
            attachCustomEditing(poly)
            attachClickHandler(poly)
            drawnItems.addLayer(poly)
            const newId = drawnItems.getLayerId(poly)
            onZoneLeafletIdUpdateRef.current(z.id, newId)
          } else if (existingLayer instanceof L.Polygon) {
            existingLayer.setLatLngs(getRectangleVertices(z.zone as ZoneRectangle))
            attachCustomEditing(existingLayer)
          }
        } else if (z.zone.type === 'cercle' && existingLayer instanceof L.Circle) {
          existingLayer.setLatLng([z.zone.lat, z.zone.lon])
          existingLayer.setRadius(z.zone.rayon_km * 1000)
        }
      }
    })
  }, [zones, isEditing])

  const originalZonesRef = useRef<ZoneWithId[]>([])
  const wasSavedRef = useRef(false)

  // ─── Utilitaire : calcule le centre d'un layer ───────────────────────────────
  const getLayerCenter = (layer: L.Layer): [number, number] | null => {
    if (layer instanceof L.Circle) {
      const c = layer.getLatLng()
      return [c.lat, c.lng]
    }
    if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
      const bounds = (layer as L.Polygon).getBounds()
      return [bounds.getCenter().lat, bounds.getCenter().lng]
    }
    return null
  }

  // ─── Attache le handler de clic sur un layer ─────────────────────────────────
  const attachClickHandler = (layer: L.Layer) => {
    layer.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e)
      const zone = layerToZone(layer)
      const center = getLayerCenter(layer)
      if (zone && center && onZoneClickRef.current) {
        onZoneClickRef.current(zone, center)
      }
    })
  }

  // ─── Création unique du drawControl ─────────────────────────────────────────
  // Dépend uniquement de `map` — stable pour toute la durée de vie du composant
  useEffect(() => {
    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    drawnItemsRef.current = drawnItems

    // Personnalisation des textes des tooltips Leaflet.draw
    L.drawLocal.draw.toolbar.buttons.rectangle = 'Dessiner un rectangle (clic-glisser-relâcher)'
    L.drawLocal.draw.toolbar.buttons.circle = 'Dessiner un cercle (clic-glisser-relâcher)'
    L.drawLocal.draw.handlers.rectangle.tooltip.start = 'Cliquez et maintenez le bouton, puis glissez pour dessiner un rectangle'
    L.drawLocal.draw.handlers.circle.tooltip.start = 'Cliquez et glissez pour dessiner un cercle'

    const drawControl = new L.Control.Draw({
      position: 'topleft',
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
      draw: {
        rectangle: {
          shapeOptions: {
            color: '#6366f1',
            fillColor: '#6366f1',
            fillOpacity: 0.15,
            weight: 2,
          },
          // Désactive le mode "répétition" après chaque dessin
          repeatMode: false,
        },
        circle: {
          shapeOptions: {
            color: '#6366f1',
            fillColor: '#6366f1',
            fillOpacity: 0.15,
            weight: 2,
          },
          repeatMode: false,
        },
        polyline: false,
        polygon: false,
        marker: false,
        circlemarker: false,
      },
    })
    map.addControl(drawControl)

    // ── draw:created — nouvelle zone dessinée ────────────────────────────────
    const onCreated = (e: L.DrawEvents.Created) => {
      const layer = e.layer
      drawnItems.addLayer(layer)
      const leafletId = drawnItems.getLayerId(layer)

      // Attacher le handler de clic pour les stats de zone
      attachClickHandler(layer)

      const zone = layerToZone(layer)
      if (zone) {
        const nextIdx = zonesRef.current.length + 1
        const defaultName = zone.type === 'rectangle' ? `Rectangle #${nextIdx}` : `Cercle #${nextIdx}`
        const userInput = prompt("Nom de la zone (laisser vide pour le nom par défaut) :", defaultName)
        zone.nom = (userInput !== null && userInput.trim() !== '') ? userInput.trim() : defaultName
        onZoneAddRef.current(zone, leafletId)
      }
    }

    // ── draw:edited — zones modifiées via l'outil édition ───────────────────
    const onEdited = (e: L.DrawEvents.Edited) => {
      wasSavedRef.current = true
      setIsEditing(false)
      e.layers.eachLayer((layer) => {
        const leafletId = drawnItems.getLayerId(layer)
        const zone = layerToZone(layer)
        if (zone) {
          onZoneEditRef.current(leafletId, zone)
        }
      })
    }

    // ── draw:deleted — zones supprimées via l'outil suppression ─────────────
    const onDeleted = (e: L.DrawEvents.Deleted) => {
      wasSavedRef.current = true
      setIsEditing(false)
      e.layers.eachLayer((layer) => {
        const leafletId = drawnItems.getLayerId(layer)
        onZoneRemoveRef.current(leafletId)
      })
    }

    const onEditStart = () => {
      setIsEditing(true)
      originalZonesRef.current = JSON.parse(JSON.stringify(zonesRef.current))
      wasSavedRef.current = false
    }
    const onEditStop = () => {
      setIsEditing(false)
      if (!wasSavedRef.current) {
        // Annulation : restaurer l'état précédent
        originalZonesRef.current.forEach((z) => {
          if (z.leafletId !== undefined) {
            onZoneEditRef.current(z.leafletId, z.zone)
          }
        })
      }
    }

    map.on(L.Draw.Event.CREATED, onCreated as L.LeafletEventHandlerFn)
    map.on(L.Draw.Event.EDITED, onEdited as L.LeafletEventHandlerFn)
    map.on(L.Draw.Event.DELETED, onDeleted as L.LeafletEventHandlerFn)
    map.on(L.Draw.Event.EDITSTART, onEditStart)
    map.on(L.Draw.Event.EDITSTOP, onEditStop)

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated as L.LeafletEventHandlerFn)
      map.off(L.Draw.Event.EDITED, onEdited as L.LeafletEventHandlerFn)
      map.off(L.Draw.Event.DELETED, onDeleted as L.LeafletEventHandlerFn)
      map.off(L.Draw.Event.EDITSTART, onEditStart)
      map.off(L.Draw.Event.EDITSTOP, onEditStop)
      map.removeControl(drawControl)
      map.removeLayer(drawnItems)
      drawnItemsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]) // ← intentionnellement limité à `map` : les callbacks passent par des refs

  return (
    <>
      {zones
        .filter((z) => z.active && z.zone.type === 'rectangle' && z.leafletId !== undefined)
        .map((z) => {
          const rect = z.zone as ZoneRectangle
          const latCenter = (rect.lat_min + rect.lat_max) / 2
          const lonCenter = (rect.lon_min + rect.lon_max) / 2
          const rotation = rect.rotation || 0

          const vertices = getRectangleVertices(rect)

          return (
            <Fragment key={z.id}>
              <Marker
                position={[latCenter, lonCenter]}
                icon={isEditing ? moveIcon : rotateIcon}
                draggable={isEditing}
                eventHandlers={{
                  click: (e) => {
                    if (isEditing) {
                      e.target.closePopup()
                    }
                  },
                  drag: (e) => {
                    if (!isEditing) return
                    const marker = e.target
                    const newLatLng = marker.getLatLng()
                    
                    const dLat = newLatLng.lat - latCenter
                    const dLon = newLatLng.lng - lonCenter
                    
                    const updatedZone: Zone = {
                      ...rect,
                      lat_min: rect.lat_min + dLat,
                      lat_max: rect.lat_max + dLat,
                      lon_min: rect.lon_min + dLon,
                      lon_max: rect.lon_max + dLon,
                    }
                    onZoneEditRef.current(z.leafletId!, updatedZone)
                  }
                }}
              >
                <Popup minWidth={220} className="rotation-popup">
                  {isEditing ? (
                    <div className="p-2 text-slate-400 text-xs text-center font-sans">
                      Déplacez le marqueur pour centrer la zone
                    </div>
                  ) : (
                    <div className="p-3 text-slate-200 bg-slate-900 rounded-lg space-y-3 font-sans">
                      <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                        <span className="text-lg">🔄</span>
                        <h4 className="text-sm font-semibold text-white">Rotation du rectangle</h4>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400">Angle</span>
                          <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-indigo-400 font-bold border border-slate-700">
                            {rotation > 0 ? `+${rotation}` : rotation}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          value={rotation}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10)
                            const updatedZone: Zone = {
                              ...rect,
                              rotation: val,
                            }
                            onZoneEditRef.current(z.leafletId!, updatedZone)
                          }}
                          className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-[10px] text-slate-500 italic">Glissez pour pivoter</span>
                        <button
                          onClick={() => {
                            const updatedZone: Zone = {
                              ...rect,
                              rotation: 0,
                            }
                            onZoneEditRef.current(z.leafletId!, updatedZone)
                          }}
                          className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          Réinitialiser
                        </button>
                      </div>
                    </div>
                  )}
                </Popup>
              </Marker>

              {isEditing &&
                vertices.map((vertex, index) => {
                  const icon = index === 0 || index === 2 ? cornerNwseIcon : cornerNeswIcon
                  return (
                    <Marker
                      key={`${z.id}-corner-${index}`}
                      position={vertex}
                      icon={icon}
                      draggable={true}
                      eventHandlers={{
                        drag: (e) => {
                          const markerLatLng = e.target.getLatLng()
                          const opp = (index + 2) % 4
                          const P_opp = L.latLng(vertices[opp])
                          
                          const theta = (rect.rotation || 0) * Math.PI / 180
                          const cos = Math.cos(theta)
                          const sin = Math.sin(theta)
                          
                          // Vecteur depuis le coin opposé fixe vers le marqueur déplacé
                          const dLon = markerLatLng.lng - P_opp.lng
                          const dLat = markerLatLng.lat - P_opp.lat
                          
                          // Projection sur les axes locaux du rectangle
                          const dxLocal = dLon * cos + dLat * sin
                          const dyLocal = -dLon * sin + dLat * cos
                          
                          // Reconstruction des 4 coins
                          const newLatLngs = new Array<L.LatLng>(4)
                          newLatLngs[opp] = P_opp
                          newLatLngs[index] = L.latLng(
                            P_opp.lat + dxLocal * sin + dyLocal * cos,
                            P_opp.lng + dxLocal * cos - dyLocal * sin
                          )
                          newLatLngs[index ^ 1] = L.latLng(
                            P_opp.lat + dyLocal * cos,
                            P_opp.lng - dyLocal * sin
                          ) // X-adjacent (utilise le déplacement Y)
                          newLatLngs[index ^ 3] = L.latLng(
                            P_opp.lat + dxLocal * sin,
                            P_opp.lng + dxLocal * cos
                          ) // Y-adjacent (utilise le déplacement X)
                          
                          // Calcul des nouvelles bornes non tournées
                          const newLatCenter = (newLatLngs[0].lat + newLatLngs[2].lat) / 2
                          const newLonCenter = (newLatLngs[0].lng + newLatLngs[2].lng) / 2
                          
                          const radNeg = -theta
                          const cosNeg = Math.cos(radNeg)
                          const sinNeg = Math.sin(radNeg)
                          
                          const unrot = newLatLngs.map((p) => {
                            const dy = p.lat - newLatCenter
                            const dx = p.lng - newLonCenter
                            const unrotLon = newLonCenter + dx * cosNeg - dy * sinNeg
                            const unrotLat = newLatCenter + dx * sinNeg + dy * cosNeg
                            return L.latLng(unrotLat, unrotLon)
                          })
                          
                          const lats = unrot.map((p) => p.lat)
                          const lons = unrot.map((p) => p.lng)
                          
                          const updatedZone: Zone = {
                            ...rect,
                            lat_min: Math.min(...lats),
                            lat_max: Math.max(...lats),
                            lon_min: Math.min(...lons),
                            lon_max: Math.max(...lons),
                          }
                          onZoneEditRef.current(z.leafletId!, updatedZone)
                        },
                      }}
                    />
                  )
                })}
            </Fragment>
          )
        })}
    </>
  )
}
