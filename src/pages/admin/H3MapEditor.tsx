import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import * as h3 from 'h3-js';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface H3Zona { h3_index: string; precio: number; nombre: string; resolucion: number; }
interface HistoryEntry {
  id: string; timestamp: Date; description: string;
  hexCount: number; precio: number;
  snapshot: { hex: string; oldData: H3Zona | undefined }[];
}
interface Toast { id: string; message: string; color: string; }

const PRECIOS_COLORES: Record<number, { stroke: string; label: string; emoji: string }> = {
  45:  { stroke: '#22C55E', label: '$45 (Base)', emoji: '🟢' },
  50:  { stroke: '#EAB308', label: '$50',        emoji: '🟡' },
  55:  { stroke: '#F59E0B', label: '$55',        emoji: '🟠' },
  60:  { stroke: '#FF6B00', label: '$60',        emoji: '🍊' },
  65:  { stroke: '#FF4500', label: '$65',        emoji: '🍁' },
  70:  { stroke: '#EF4444', label: '$70',        emoji: '🔴' },
  75:  { stroke: '#DC2626', label: '$75',        emoji: '🍒' },
  80:  { stroke: '#B91C1C', label: '$80',        emoji: '🍷' },
  90:  { stroke: '#A855F7', label: '$90',        emoji: '🟣' },
  100: { stroke: '#7E22CE', label: '$100',       emoji: '🔮' },
};

function getZonaColor(precio: number): string {
  return PRECIOS_COLORES[precio]?.stroke ?? '#94A3B8';
}

export default function H3MapEditor() {
  const mapRef        = useRef<HTMLDivElement>(null);
  const leafletMap    = useRef<any>(null);
  const leafletLayers = useRef<Map<string, any>>(new Map());
  const Lref          = useRef<any>(null);

  // Datos
  const [zonas,        setZonas]       = useState<H3Zona[]>([]);
  const [kmlPolygons,  setKmlPolygons] = useState<{ nombre: string; coords: number[][] }[]>([]);
  const [selectedHex,  setSelectedHex] = useState<string | null>(null);
  const [editForm,     setEditForm]    = useState({ precio: 45, nombre: '' });
  const [loading,      setLoading]     = useState(true);
  const [saving,       setSaving]      = useState(false);

  // Herramientas
  const [activeTool,    setActiveTool]    = useState<'select' | 'paint' | 'fill' | 'erase'>('select');
  const [selectedPrice, setSelectedPrice] = useState<number>(45);
  const [hexOpacity,    setHexOpacity]    = useState(0.65);
  const [showLabels,    setShowLabels]    = useState(true);
  const [simulatorMode, setSimulatorMode] = useState(false);

  // UI
  const [activeTab,      setActiveTab]      = useState<'tools'|'stats'|'history'|'config'>('tools');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<{ nombre: string; coords: number[][] }[]>([]);
  const [activeZoneInfo, setActiveZoneInfo] = useState<{ nombre: string; precio: number } | null>(null);
  const [toasts,         setToasts]         = useState<Toast[]>([]);
  const [simResult,      setSimResult]      = useState<{ nombre: string; precio: number; lat: number; lng: number; hex?: string } | null>(null);
  const [legendOpen,     setLegendOpen]     = useState(true);
  const [saveStatus,     setSaveStatus]     = useState<'idle'|'saving'|'saved'>('idle');
  const [historyLog,     setHistoryLog]     = useState<HistoryEntry[]>([]);
  const [mapCenter]                         = useState<[number, number]>([16.25, -92.13]);

  // Undo / Redo
  const undoStackRef = useRef<{ hex: string; oldData: H3Zona | undefined }[][]>([]);
  const redoStackRef = useRef<{ hex: string; newData: H3Zona }[][]>([]);

  // ─── Toast Helper ────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, color = '#22C55E') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, color }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // ─── Undo ────────────────────────────────────────────────────────────────
  const undo = useCallback(async () => {
    const lastAction = undoStackRef.current.pop();
    if (!lastAction || lastAction.length === 0) { showToast('Nada que deshacer', '#F59E0B'); return; }
    const toDelete = lastAction.filter(x => !x.oldData).map(x => x.hex);
    const toUpsert = lastAction.filter(x => x.oldData).map(x => x.oldData as H3Zona);
    setZonas(prev => {
      let next = [...prev];
      next = next.filter(z => !toDelete.includes(z.h3_index));
      toUpsert.forEach(u => { const idx = next.findIndex(z => z.h3_index === u.h3_index); if (idx >= 0) next[idx] = u; else next.push(u); });
      return next;
    });
    if (toDelete.length > 0) supabase.from('h3_zonas').delete().in('h3_index', toDelete).then();
    if (toUpsert.length > 0) supabase.from('h3_zonas').upsert(toUpsert, { onConflict: 'h3_index' }).then();
    showToast(`Deshecho (${lastAction.length} hex)`, '#3B82F6');
  }, [showToast]);

  // ─── Redo ────────────────────────────────────────────────────────────────
  const redo = useCallback(async () => {
    const lastRedo = redoStackRef.current.pop();
    if (!lastRedo || lastRedo.length === 0) { showToast('Nada que rehacer', '#F59E0B'); return; }
    const batch = lastRedo.map(x => x.newData);
    setZonas(prev => { const next = [...prev]; batch.forEach(u => { const idx = next.findIndex(z => z.h3_index === u.h3_index); if (idx >= 0) next[idx] = u; else next.push(u); }); return next; });
    supabase.from('h3_zonas').upsert(batch, { onConflict: 'h3_index' }).then();
    showToast(`Rehecho (${lastRedo.length} hex)`, '#8B5CF6');
  }, [showToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);


  // ─── Cargar polígonos de referencia (KML) ───────────────────────────────
  const loadPolygons = useCallback(async () => {
    const { data: kml } = await supabase.from('zonas_kml').select('nombre, geom').eq('activo', true);
    const { data: col } = await supabase.from('colonias').select('nombre, geom').not('geom', 'is', null);
    
    const polys: {nombre: string, coords: number[][]}[] = [];
    const parse = (arr: any[]) => arr.forEach(item => {
      if (item.geom && item.geom.coordinates && item.geom.coordinates[0]) {
        // GeoJSON es [lng, lat], Leaflet usa [lat, lng]
        const coords = item.geom.coordinates[0].map((c: number[]) => [c[1], c[0]]);
        polys.push({ nombre: item.nombre, coords });
      }
    });
    
    if (kml) parse(kml);
    if (col) parse(col);
    
    setKmlPolygons(polys);
  }, []);

  // ─── Cargar datos ──────────────────────────────────────────────────────────
  const loadZonas = useCallback(async () => {
    setLoading(true);
    let allData: H3Zona[] = [];
    let page = 0;
    const pageSize = 1000;
    
    // Supabase tiene un límite por defecto de 1000 filas por consulta, paginamos:
    while (true) {
      const { data, error } = await supabase.from('h3_zonas').select('*').range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) {
        console.error("Error fetching zonas:", error);
        break;
      }
      if (data) {
        allData = [...allData, ...data];
      }
      if (!data || data.length < pageSize) {
        break;
      }
      page++;
    }

    setZonas(allData);
    setLoading(false);
    return allData;
  }, []);

  // ─── Guardar celda ────────────────────────────────────────────────────────
  const saveCell = async (hex: string, precio: number, nombre: string) => {
    setSaving(true); setSaveStatus('saving');
    const resolucion = h3.getResolution(hex);
    await supabase.from('h3_zonas').upsert({ h3_index: hex, precio, nombre: nombre || 'Zona H3', resolucion }, { onConflict: 'h3_index' });
    setSaving(false); setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
    showToast('Celda guardada', '#22C55E');
  };

  // ─── Ejecutar pintura con historial y Undo/Redo ──────────────────────────
  const executePaint = useCallback((hexes: string[], brushValue: number, zonaNombre: string | null, currentZonas: H3Zona[]) => {
    const nombreToSave = zonaNombre || 'Zona Personalizada';
    const oldStates = hexes.map(h => ({ hex: h, oldData: currentZonas.find(z => z.h3_index === h) }));
    undoStackRef.current.push(oldStates);
    redoStackRef.current = [];
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();

    if (brushValue === 0) {
      setZonas(prev => prev.filter(z => !hexes.includes(z.h3_index)));
      supabase.from('h3_zonas').delete().in('h3_index', hexes).then();
      if (hexes.length > 1) showToast(`Borrados ${hexes.length} hexágonos`, '#EF4444');
    } else {
      const batch = hexes.map(h => ({ h3_index: h, precio: brushValue, nombre: nombreToSave, resolucion: 10 }));
      setZonas(prev => {
        const next = [...prev];
        hexes.forEach(h => {
          const idx = next.findIndex(z => z.h3_index === h);
          if (idx >= 0) next[idx] = { ...next[idx], precio: brushValue, nombre: nombreToSave };
          else next.push({ h3_index: h, precio: brushValue, nombre: nombreToSave, resolucion: 10 });
        });
        return next;
      });
      supabase.from('h3_zonas').upsert(batch, { onConflict: 'h3_index' }).then();
      redoStackRef.current.push(batch.map(b => ({ hex: b.h3_index, newData: b as H3Zona })));
      if (hexes.length > 3) showToast(`${hexes.length} hexágonos pintados en ${nombreToSave}`, getZonaColor(brushValue));
    }

    const entry: HistoryEntry = {
      id: Math.random().toString(36).slice(2), timestamp: new Date(),
      description: brushValue === 0 ? `Borrado en ${zonaNombre || 'zona'}` : `Pintado "${nombreToSave}"`,
      hexCount: hexes.length, precio: brushValue, snapshot: oldStates,
    };
    setHistoryLog(prev => [entry, ...prev].slice(0, 30));
    setSaveStatus('saving');
    setTimeout(() => setSaveStatus('saved'), 500);
    setTimeout(() => setSaveStatus('idle'), 2500);
  }, [showToast]);

  // ─── Buscador de colonias ─────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    setSearchResults(kmlPolygons.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 8));
  }, [searchQuery, kmlPolygons]);

  const flyToColonia = useCallback((poly: { nombre: string; coords: number[][] }) => {
    const map = leafletMap.current; const L = Lref.current;
    if (!map || !L) return;
    setSearchQuery(''); setSearchResults([]);
    const bounds = L.latLngBounds(poly.coords);
    map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 16, duration: 1.2 });
    const highlight = L.polygon(poly.coords, { color: '#3B82F6', weight: 4, fill: true, fillColor: '#3B82F6', fillOpacity: 0.2, interactive: false }).addTo(map);
    setTimeout(() => highlight.remove(), 2500);
  }, []);


  // ─── Inicializar Leaflet ───────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (destroyed || !mapRef.current || leafletMap.current) return;

      Lref.current = L;

      const map = L.map(mapRef.current, {
        center: mapCenter,
        zoom: 14,
        zoomControl: true,
        preferCanvas: true, // Aceleración de hardware (100x más fluido para miles de polígonos)
        zoomAnimation: true,
        markerZoomAnimation: true,
        fadeAnimation: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
        className: 'map-tiles'
      }).addTo(map);

      leafletMap.current = map;

      // Evento global de clic para crear/editar hexágonos
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        // Siempre usamos resolucion 8 por ahora
        const clickedHex = h3.latLngToCell(lat, lng, 8);
      });

      // Efectos de transición en zoom para ocultar textos y mantener fluido
      const updateZoomClass = () => {
        if (map.getZoom() < 15) {
          mapRef.current?.classList.add('zoomed-out');
        } else {
          mapRef.current?.classList.remove('zoomed-out');
        }
      };
      map.on('zoomend', updateZoomClass);
      updateZoomClass();

      const lista = await loadZonas();
      await loadPolygons();
      if (!destroyed) renderHexagons(lista, map, L);
    })();
    return () => { destroyed = true; };
  }, []);

  // ─── Dibujar polígono de referencia (Línea roja) al seleccionar hexágono ───
  const refPolygonLayer = useRef<any>(null);
  useEffect(() => {
    const map = leafletMap.current;
    const L = Lref.current;
    if (!map || !L) return;

    // Limpiar polígono de referencia anterior
    if (refPolygonLayer.current) {
      refPolygonLayer.current.remove();
      refPolygonLayer.current = null;
    }

    if (selectedHex) {
      const zona = zonas.find(z => z.h3_index === selectedHex);
      if (zona && zona.nombre) {
        // Buscar si tenemos el KML de esta zona
        const refKml = kmlPolygons.find(p => p.nombre.toLowerCase() === zona.nombre.toLowerCase());
        if (refKml) {
          refPolygonLayer.current = L.polygon(refKml.coords, {
            color: '#ef4444',     // Rojo
            weight: 4,            // Borde grueso
            fill: false,          // Sin relleno para que se vean los hexágonos
            interactive: false,
            dashArray: '10, 10'   // Línea punteada estilo "frontera"
          }).addTo(map);
          
          // Opcional: centrar el mapa en la colonia
          // map.fitBounds(refPolygonLayer.current.getBounds(), { padding: [50, 50], maxZoom: 16 });
        }
      }
    }
  }, [selectedHex, zonas, kmlPolygons]);

  // ─── Dibujar polígono persistente del simulador ───
  const simPolygonLayer = useRef<any>(null);
  useEffect(() => {
    const map = leafletMap.current; const L = Lref.current;
    if (!map || !L) return;

    if (simPolygonLayer.current) {
      simPolygonLayer.current.remove();
      simPolygonLayer.current = null;
    }

    if (simulatorMode && simResult?.hex) {
      try {
        const boundaries = h3.cellToBoundary(simResult.hex);
        simPolygonLayer.current = L.polygon(boundaries, {
          color: '#4ade80', weight: 4, fillColor: '#4ade80', fillOpacity: 0.5, interactive: false, className: 'sim-highlight-poly'
        }).addTo(map);
      } catch (e) {}
    }
  }, [simResult, simulatorMode]);

  // Update map events when tools change
  useEffect(() => {
    const map = leafletMap.current;
    const L = Lref.current;
    if (!map || !L) return;
    
    let isDragging = false;
    let lastPaintedHex: string | null = null; 
    let hoverPolygon: any = null;
    let hoverKmlLayer: any = null;
    let currentHoveredZonaName: string | null = null;
    let currentHoveredRefKml: any = null;

    const brushValue = activeTool === 'erase' ? 0 : (activeTool === 'paint' || activeTool === 'fill' ? selectedPrice : null);
    const isFillMode = activeTool === 'fill';

    const handlePaint = (lat: number, lng: number) => {
      const clickedHex = h3.latLngToCell(lat, lng, 10);
      
      if (simulatorMode) {
        const zona = zonas.find(z => z.h3_index === clickedHex);
        setSimResult({
          nombre: zona?.nombre || 'Zona Base (No personalizada)',
          precio: zona?.precio || 45, // Tarifa base por defecto
          lat, lng, hex: clickedHex
        });
        return;
      }

      if (brushValue !== null) {
        if (lastPaintedHex === clickedHex) return;
        lastPaintedHex = clickedHex;
        executePaint([clickedHex], brushValue, currentHoveredZonaName, zonas);
      } else {
        if (lastPaintedHex === clickedHex) return;
        lastPaintedHex = clickedHex;
        
        setSelectedHex(clickedHex);
        setZonas(prev => {
          const existe = prev.find(z => z.h3_index === clickedHex);
          if (existe) setEditForm({ precio: existe.precio, nombre: existe.nombre || '' });
          else setEditForm({ precio: 45, nombre: '' });
          return prev;
        });
      }
    };

    const onMouseDown = (e: any) => {
      if (simulatorMode) {
        handlePaint(e.latlng.lat, e.latlng.lng);
        return;
      }

      if (brushValue !== null) {
        isDragging = true;
        map.dragging.disable();
        if (map.touchZoom) map.touchZoom.disable();
        
        // Bote de pintura (Relleno completo)
        if (isFillMode && currentHoveredRefKml && currentHoveredZonaName) {
          // 1. Hexágonos matemáticamente dentro del KML
          let hexesToFill = h3.polygonToCells([currentHoveredRefKml.coords], 10, false);
          
          // 2. Hexágonos que el usuario ya había pintado a mano y pertenecen a esta colonia
          const existingInColonia = zonas.filter(z => z.nombre === currentHoveredZonaName).map(z => z.h3_index);
          
          // Unir ambos sin duplicados
          hexesToFill = Array.from(new Set([...hexesToFill, ...existingInColonia]));

          if (hexesToFill.length === 0) {
            const clickedHex = h3.latLngToCell(e.latlng.lat, e.latlng.lng, 10);
            hexesToFill = [clickedHex];
          }
          executePaint(hexesToFill, brushValue, currentHoveredZonaName, zonas);
        } else {
          handlePaint(e.latlng.lat, e.latlng.lng);
        }
      } else {
        handlePaint(e.latlng.lat, e.latlng.lng);
      }
    };

    const onMouseMove = (e: any) => {
      const { lat, lng } = e.latlng;
      const hoveredHex = h3.latLngToCell(lat, lng, 10);

      if (!simulatorMode && brushValue === null) {
        const zonaInfo = zonas.find(z => z.h3_index === hoveredHex);
        if (zonaInfo) setActiveZoneInfo({ nombre: zonaInfo.nombre || 'Personalizado', precio: zonaInfo.precio });
        else setActiveZoneInfo(null);
      } else {
        setActiveZoneInfo(null);
      }

      if (brushValue !== null || simulatorMode) {
        if (!hoverPolygon) {
          hoverPolygon = L.polygon([], { color: simulatorMode ? '#3B82F6' : '#fff', weight: simulatorMode ? 4 : 3, fillOpacity: simulatorMode ? 0.4 : 0.2, interactive: false, dashArray: simulatorMode ? '' : '5, 5' }).addTo(map);
        }
        hoverPolygon.setLatLngs(h3.cellToBoundary(hoveredHex));

        if (!simulatorMode) {
          const zona = zonas.find(z => z.h3_index === hoveredHex);
          if (zona && zona.nombre && zona.nombre !== 'Zona Personalizada' && zona.nombre !== 'Zona Pintada') {
            const refKml = kmlPolygons.find(p => p.nombre.toLowerCase() === zona.nombre.toLowerCase());
            if (refKml) {
              currentHoveredZonaName = zona.nombre;
              currentHoveredRefKml = refKml;
              
              if (!hoverKmlLayer) {
                hoverKmlLayer = L.polygon([], { color: '#ef4444', weight: 4, fill: isFillMode ? true : false, fillColor: '#ef4444', fillOpacity: 0.15, interactive: false, dashArray: '10, 10' }).addTo(map);
              }
              hoverKmlLayer.setLatLngs(refKml.coords);
              if (isFillMode) {
                hoverKmlLayer.bindTooltip(`📍 ${zona.nombre} (Clic para Rellenar)`, { sticky: true, direction: 'top', className: 'hover-tooltip' }).openTooltip(e.latlng);
              }
            } else {
              currentHoveredZonaName = null; currentHoveredRefKml = null;
              if (hoverKmlLayer) { hoverKmlLayer.remove(); hoverKmlLayer = null; }
            }
          } else {
            currentHoveredZonaName = null; currentHoveredRefKml = null;
            if (hoverKmlLayer) { hoverKmlLayer.remove(); hoverKmlLayer = null; }
          }
        }
      } else {
        if (hoverPolygon) { hoverPolygon.remove(); hoverPolygon = null; }
        if (hoverKmlLayer) { hoverKmlLayer.remove(); hoverKmlLayer = null; }
      }

      if (isDragging && brushValue !== null && !simulatorMode) {
        handlePaint(lat, lng);
      }
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        map.dragging.enable();
        if (map.touchZoom) map.touchZoom.enable();
      }
    };

    const onTouchMove = (e: any) => {
      if (isDragging && brushValue !== null && e.originalEvent.touches.length > 0 && !simulatorMode) {
        e.originalEvent.preventDefault();
        const touch = e.originalEvent.touches[0];
        const latlng = map.mouseEventToLatLng(touch);
        handlePaint(latlng.lat, latlng.lng);
      }
    };

    map.off('mousedown touchstart');
    map.off('mousemove');
    map.off('touchmove');
    map.off('mouseup touchend');

    map.on('mousedown touchstart', onMouseDown);
    map.on('mousemove', onMouseMove);
    map.on('touchmove', onTouchMove);
    map.on('mouseup touchend', onMouseUp);

    return () => { 
      map.off('mousedown touchstart', onMouseDown);
      map.off('mousemove', onMouseMove);
      map.off('touchmove', onTouchMove);
      map.off('mouseup touchend', onMouseUp);
      map.dragging.enable();
      if (map.touchZoom) map.touchZoom.enable();
    };
  }, [activeTool, selectedPrice, zonas, kmlPolygons, simulatorMode, executePaint]);

  // ─── Renderizar hexágonos ──────────────────────────────────────────────────
  const renderHexagons = useCallback((lista: H3Zona[], map?: any, L?: any) => {
    const m = map || leafletMap.current;
    const Lib = L || Lref.current;
    if (!m || !Lib) return;

    leafletLayers.current.forEach(layer => layer.remove());
    leafletLayers.current.clear();

    lista.forEach(zona => {
      let boundaries: number[][];
      try { boundaries = h3.cellToBoundary(zona.h3_index); } catch (e) { return; }
      
      const priceColor = getZonaColor(zona.precio);
      const polygon = Lib.polygon(boundaries, {
        color: priceColor, weight: 1, fillColor: priceColor, fillOpacity: hexOpacity, interactive: false,
      }).addTo(m);

      const layers = [polygon];
      if (showLabels) {
        const center = h3.cellToLatLng(zona.h3_index);
        const icon = Lib.divIcon({
          className: 'hex-label',
          html: `<div style="color: ${priceColor}; font-weight: bold; font-size: 11px; text-shadow: 0 1px 2px rgba(0,0,0,0.8);">$${zona.precio}</div>`,
          iconSize: [30, 15]
        });
        layers.push(Lib.marker(center, { icon, interactive: false }).addTo(m));
      }

      leafletLayers.current.set(zona.h3_index, Lib.layerGroup(layers).addTo(m));
    });
  }, [hexOpacity, showLabels]);

  useEffect(() => {
    if (zonas.length >= 0) renderHexagons(zonas);
  }, [zonas, hexOpacity, showLabels, renderHexagons]);

  // ─── Eliminar hex ──────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selectedHex) return;
    await supabase.from('h3_zonas').delete().eq('h3_index', selectedHex);
    setSelectedHex(null);
    setZonas(prev => prev.filter(z => z.h3_index !== selectedHex));
  };

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="h3-editor-container">
      {/* Panel lateral */}
      <div className="h3-editor-sidebar">
        {/* Header */}
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyItems: 'center' }}>
            <span style={{ fontSize: 24 }}>⬡</span>
            <div>
              <div style={{ color: '#f8fafc', fontWeight: 700, fontSize: 16 }}>Modo Dios - H3</div>
              <div style={{ color: '#94a3b8', fontSize: 12 }}>Editor de Tarifas Dinámicas</div>
            </div>
            {saveStatus !== 'idle' && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: saveStatus === 'saved' ? '#4ade80' : '#facc15' }}>
                {saveStatus === 'saving' ? '⏳...' : '✅'}
              </div>
            )}
          </div>
          
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginTop: 16, background: '#0f172a', padding: 4, borderRadius: 8 }}>
            {[
              { id: 'tools', label: '🖌️ Pintar' },
              { id: 'stats', label: '📊 Stats' },
              { id: 'history', label: '⏪ Hist.' },
              { id: 'config', label: '⚙️ Conf.' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                style={{
                  flex: 1, padding: '6px 0', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: activeTab === t.id ? '#1e293b' : 'transparent',
                  color: activeTab === t.id ? '#f8fafc' : '#64748b',
                  boxShadow: activeTab === t.id ? '0 1px 3px rgba(0,0,0,0.5)' : 'none'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          
          {activeTab === 'tools' && (
            <>
              {/* Buscador y Navegación */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                <div style={{ position: 'relative' }}>
                  <input 
                    placeholder="🔍 Buscar colonia o zona..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px 10px 36px', color: '#f1f5f9', fontSize: 13, boxSizing: 'border-box' }}
                  />
                  <span style={{ position: 'absolute', left: 12, top: 10, fontSize: 14 }}>🎯</span>
                  
                  {searchResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e293b', border: '1px solid #334155', borderRadius: 8, marginTop: 4, zIndex: 100, maxHeight: 200, overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                      {searchResults.map(r => (
                        <div key={r.nombre} onClick={() => flyToColonia(r)} style={{ padding: '10px 15px', color: '#cbd5e1', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #334155' }} onMouseOver={e => (e.currentTarget.style.background = '#0f172a')} onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                          📍 {r.nombre}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Pincel Rápido */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Herramienta Activa</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 15 }}>
                  <button onClick={() => { setActiveTool('select'); setSelectedHex(null); }} style={{ padding: '8px', borderRadius: 6, border: `2px solid ${activeTool === 'select' ? '#3B82F6' : '#334155'}`, background: activeTool === 'select' ? '#3B82F640' : '#0f172a', color: '#f1f5f9', fontSize: 12, cursor: 'pointer' }}>↖️ Seleccionar</button>
                  <button onClick={() => setActiveTool('paint')} style={{ padding: '8px', borderRadius: 6, border: `2px solid ${activeTool === 'paint' ? '#3B82F6' : '#334155'}`, background: activeTool === 'paint' ? '#3B82F640' : '#0f172a', color: '#f1f5f9', fontSize: 12, cursor: 'pointer' }}>🖌️ Pintar</button>
                  <button onClick={() => setActiveTool('fill')} style={{ padding: '8px', borderRadius: 6, border: `2px solid ${activeTool === 'fill' ? '#3B82F6' : '#334155'}`, background: activeTool === 'fill' ? '#3B82F640' : '#0f172a', color: '#f1f5f9', fontSize: 12, cursor: 'pointer' }}>🪣 Rellenar</button>
                  <button onClick={() => setActiveTool('erase')} style={{ padding: '8px', borderRadius: 6, border: `2px solid ${activeTool === 'erase' ? '#ef4444' : '#334155'}`, background: activeTool === 'erase' ? '#ef444440' : '#0f172a', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>🧹 Borrar</button>
                </div>

                {activeTool === 'paint' || activeTool === 'fill' ? (
                  <>
                    <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Paleta de Colores</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(PRECIOS_COLORES).map(([keyStr, val]) => {
                        const p = parseInt(keyStr);
                        return (
                          <button
                            key={p}
                            onClick={() => setSelectedPrice(p)}
                            style={{ padding: '6px 10px', borderRadius: 6, border: `2px solid ${selectedPrice === p ? val.stroke : '#334155'}`, background: selectedPrice === p ? `${val.stroke}40` : '#0f172a', color: selectedPrice === p ? val.stroke : '#cbd5e1', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            {val.emoji} ${p}
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : null}
                
                <div style={{ marginTop: 15, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ flex: 1, fontSize: 11, color: '#64748b' }}>
                    {activeTool === 'select' && 'Clic para editar un hexágono.'}
                    {activeTool === 'paint' && 'Clic o arrastra para pintar.'}
                    {activeTool === 'fill' && 'Clic en una colonia para rellenarla.'}
                    {activeTool === 'erase' && 'Clic o arrastra para borrar.'}
                  </div>
                  <button onClick={undo} style={{ background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', cursor: 'pointer', fontSize: 12, padding: '4px 8px', borderRadius: 6 }} title="Deshacer (Ctrl+Z)">↩️</button>
                  <button onClick={redo} style={{ background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1', cursor: 'pointer', fontSize: 12, padding: '4px 8px', borderRadius: 6 }} title="Rehacer (Ctrl+Y)">↪️</button>
                </div>
              </div>

              {/* Editor Individual */}
              <div style={{ padding: 20, flex: 1 }}>
                {activeTool !== 'select' ? (
                  <div style={{ textAlign: 'center', color: '#64748b', marginTop: 20 }}>
                    <div style={{ fontSize: 24, marginBottom: 10 }}>🖱️</div>
                    Modo Herramienta Activo. Usa el mapa para pintar o borrar.
                  </div>
                ) : !selectedHex ? (
                  <div style={{ textAlign: 'center', color: '#64748b', marginTop: 20 }}>
                    <div style={{ fontSize: 24, marginBottom: 10 }}>↖️</div>
                    Haz clic en un hexágono en el mapa para editar sus detalles específicos.
                  </div>
                ) : (
                  <div style={{ animation: 'fadeIn 0.2s' }}>
                    <div style={{ color: '#3B82F6', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10, letterSpacing: 1 }}>⬡ Hexágono {selectedHex.substring(0,8)}...</div>
                    <input
                      value={editForm.nombre}
                      onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                      placeholder="Nombre de la zona"
                      style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#f1f5f9', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 15 }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 15 }}>
                      {Object.entries(PRECIOS_COLORES).map(([keyStr, val]) => {
                        const p = parseInt(keyStr);
                        return (
                          <button
                            key={p} onClick={() => setEditForm(f => ({ ...f, precio: p }))}
                            style={{ padding: '8px', borderRadius: 8, border: `2px solid ${editForm.precio === p ? val.stroke : '#334155'}`, background: editForm.precio === p ? `${val.stroke}40` : '#0f172a', color: editForm.precio === p ? val.stroke : '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 700, textAlign: 'center' }}
                          >
                            {val.label}
                          </button>
                        )
                      })}
                    </div>
                    <button
                      onClick={() => saveCell(selectedHex, editForm.precio, editForm.nombre)}
                      disabled={saving}
                      style={{ width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: saving ? '#334155' : 'linear-gradient(135deg, #3B82F6, #8B5CF6)', color: '#fff', fontWeight: 700, fontSize: 14 }}
                    >
                      {saving ? '⏳ Guardando...' : '💾 Guardar'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'stats' && (
            <div style={{ padding: 20 }}>
               <div style={{ background: '#0f172a', padding: 15, borderRadius: 10, border: '1px solid #334155', marginBottom: 15 }}>
                 <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 5 }}>Total de Hexágonos Cubiertos</div>
                 <div style={{ color: '#f8fafc', fontSize: 24, fontWeight: 800 }}>{zonas.length}</div>
                 <div style={{ color: '#3B82F6', fontSize: 11, marginTop: 5 }}>Resolución H3: Nivel 10</div>
               </div>
               
               <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Distribución por Precio</div>
               {Object.entries(PRECIOS_COLORES).map(([keyStr, val]) => {
                 const p = parseInt(keyStr);
                 const count = zonas.filter(z => z.precio === p).length;
                 if (count === 0) return null;
                 const perc = Math.round((count / zonas.length) * 100);
                 return (
                   <div key={p} style={{ marginBottom: 10 }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1', marginBottom: 4 }}>
                       <span>{val.emoji} ${p}</span>
                       <span>{count} celdas ({perc}%)</span>
                     </div>
                     <div style={{ height: 6, background: '#0f172a', borderRadius: 3, overflow: 'hidden' }}>
                       <div style={{ width: `${perc}%`, height: '100%', background: val.stroke, borderRadius: 3 }}></div>
                     </div>
                   </div>
                 )
               })}
            </div>
          )}

          {activeTab === 'history' && (
            <div style={{ padding: 20 }}>
              <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600, marginBottom: 15 }}>Acciones Recientes</div>
              {historyLog.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 20 }}>No hay acciones en esta sesión.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {historyLog.map(entry => (
                    <div key={entry.id} style={{ background: '#0f172a', padding: 12, borderRadius: 8, border: '1px solid #334155', borderLeft: `4px solid ${entry.precio === 0 ? '#ef4444' : getZonaColor(entry.precio)}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#f8fafc', fontSize: 12, fontWeight: 600 }}>{entry.description}</span>
                        <span style={{ color: '#64748b', fontSize: 10 }}>{entry.timestamp.toLocaleTimeString()}</span>
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>{entry.hexCount} hexágonos afectados</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'config' && (
            <div style={{ padding: 20 }}>
              <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600, marginBottom: 15 }}>Configuración del Mapa</div>
              
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 13, marginBottom: 15 }}>
                Mostrar Etiquetas de Precio
                <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 13, marginBottom: 15 }}>
                Modo Simulador de Viaje
                <input type="checkbox" checked={simulatorMode} onChange={e => setSimulatorMode(e.target.checked)} />
              </label>

              <div style={{ marginBottom: 15 }}>
                <div style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 8 }}>Opacidad de Hexágonos: {Math.round(hexOpacity * 100)}%</div>
                <input type="range" min="0.1" max="1" step="0.05" value={hexOpacity} onChange={e => setHexOpacity(parseFloat(e.target.value))} style={{ width: '100%' }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mapa y Overlays */}
      <div className="h3-editor-map">
        <div ref={mapRef} style={{ width: '100%', height: '100%', cursor: simulatorMode ? 'crosshair' : (activeTool === 'select' ? 'default' : 'cell') }} />

        {/* Simulador Flotante */}
        {simulatorMode && (
          <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)', padding: '15px 25px', borderRadius: 30, border: '1px solid #3b82f6', color: '#f8fafc', boxShadow: '0 10px 25px rgba(59, 130, 246, 0.2)', zIndex: 1000, display: 'flex', alignItems: 'center', gap: 15 }}>
            <span style={{ fontSize: 24 }}>📍</span>
            <div>
              <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Modo Simulador</div>
              <div style={{ fontSize: 14 }}>Haz clic en cualquier casa para ver la tarifa</div>
            </div>
            {simResult && (
              <div style={{ background: '#1e293b', padding: '8px 15px', borderRadius: 20, border: '1px solid #334155', marginLeft: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Cotización</div>
                  <div style={{ fontWeight: 800, color: '#4ade80', fontSize: 18 }}>${simResult.precio}</div>
                </div>
                {simResult.nombre && <div style={{ fontSize: 11, color: '#cbd5e1', background: '#334155', padding: '2px 6px', borderRadius: 4 }}>{simResult.nombre}</div>}
              </div>
            )}
          </div>
        )}

        {/* Legend Flotante */}
        {legendOpen && !simulatorMode && (
          <div style={{ position: 'absolute', bottom: 30, right: 30, background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)', padding: 15, borderRadius: 12, border: '1px solid #334155', color: '#f8fafc', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 1000, width: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
              Leyenda
              <span onClick={() => setLegendOpen(false)} style={{ cursor: 'pointer' }}>✖</span>
            </div>
            {Object.entries(PRECIOS_COLORES).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                <div style={{ width: 12, height: 12, background: v.stroke, borderRadius: '50%' }}></div>
                ${k}
              </div>
            ))}
          </div>
        )}
        {!legendOpen && !simulatorMode && (
           <div onClick={() => setLegendOpen(true)} style={{ position: 'absolute', bottom: 30, right: 30, background: 'rgba(15, 23, 42, 0.9)', padding: 10, borderRadius: '50%', cursor: 'pointer', zIndex: 1000, border: '1px solid #334155', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
             📖
           </div>
        )}

        {/* Toasts de Notificación */}
        <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1100, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {toasts.map(t => (
            <div key={t.id} style={{ background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)', border: `1px solid ${t.color}`, color: '#f8fafc', padding: '10px 20px', borderRadius: 30, fontSize: 13, fontWeight: 600, boxShadow: `0 4px 15px ${t.color}30`, animation: 'fadeIn 0.3s' }}>
              {t.message}
            </div>
          ))}
        </div>

        {/* Hover info en el mapa */}
        {activeZoneInfo && !simulatorMode && (
          <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 1000, background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)', border: '1px solid #334155', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', animation: 'fadeIn 0.2s' }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: getZonaColor(activeZoneInfo.precio), boxShadow: `0 0 10px ${getZonaColor(activeZoneInfo.precio)}` }}></div>
            <div>
              <div style={{ color: '#f8fafc', fontSize: 14, fontWeight: 700 }}>${activeZoneInfo.precio}</div>
              {activeZoneInfo.nombre && <div style={{ color: '#94a3b8', fontSize: 11 }}>{activeZoneInfo.nombre}</div>}
            </div>
          </div>
        )}

      </div>

      <style>{`
        .h3-editor-container { display: flex; height: 100vh; width: 100vw; font-family: 'Inter', sans-serif; background: #0f172a; overflow: hidden; }
        .h3-editor-sidebar { width: 340px; min-width: 340px; height: 100vh; background: #1e293b; display: flex; flex-direction: column; box-shadow: 4px 0 20px #0005; z-index: 1000; }
        .h3-editor-map { flex: 1; position: relative; height: 100vh; }
        @media (max-width: 768px) {
          .h3-editor-container { flex-direction: column-reverse; }
          .h3-editor-sidebar { width: 100%; min-width: 100%; height: 50vh; border-top-left-radius: 20px; border-top-right-radius: 20px; box-shadow: 0 -4px 20px #0005; }
          .h3-editor-map { height: 50vh; width: 100vw; }
        }
        .leaflet-control-zoom a, .leaflet-bar a { background: #1e293b !important; border-color: #334155 !important; color: #f1f5f9 !important; }
        .leaflet-container { background: #0f172a; }
        .hex-label { display: flex; align-items: center; justify-content: center; background: transparent; border: none; transition: opacity 0.3s; color: #fff; text-shadow: 0 1px 3px #000; font-weight: 700; font-size: 11px; }
        .zoomed-out .hex-label { opacity: 0 !important; pointer-events: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
