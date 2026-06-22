import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// Tipos
interface ZonaPolygon {
  id: string;
  tipo: 'colonia' | 'kml';
  nombre: string;
  precio: number;
  etiqueta_zona?: string;
  geom: GeoJSONGeometry | null;
  activo?: boolean;
}

interface GeoJSONGeometry {
  type: string;
  coordinates: number[][][];
}

const COLORES_ZONA: Record<string, { fill: string; stroke: string; label: string }> = {
  'ZONA AZUL':     { fill: '#3B82F650', stroke: '#3B82F6', label: '🔵 Azul' },
  'ZONA VERDE':    { fill: '#22C55E50', stroke: '#22C55E', label: '🟢 Verde' },
  'ZONA AMARILLA': { fill: '#EAB30850', stroke: '#EAB308', label: '🟡 Amarilla' },
  'ZONA NARANJA':  { fill: '#F9731650', stroke: '#F97316', label: '🟠 Naranja' },
  'ZONA ROJA':     { fill: '#EF444450', stroke: '#EF4444', label: '🔴 Roja' },
  'ZONA MORADA':   { fill: '#A855F750', stroke: '#A855F7', label: '🟣 Morada' },
};

const PRECIO_DEFECTO_ZONA: Record<string, number> = {
  'ZONA AZUL': 45,
  'ZONA VERDE': 45,
  'ZONA AMARILLA': 55,
  'ZONA NARANJA': 65,
  'ZONA ROJA': 80,
  'ZONA MORADA': 100,
};

function geomToLatLngs(geom: GeoJSONGeometry | null): [number, number][] | null {
  if (!geom || geom.type !== 'Polygon' || !geom.coordinates?.[0]) return null;
  return geom.coordinates[0].map(([lng, lat]) => [lat, lng]);
}

function latLngsToWKT(latlngs: [number, number][]): string {
  const pts = [...latlngs, latlngs[0]].map(([lat, lng]) => `${lng} ${lat}`).join(', ');
  return `POLYGON((${pts}))`;
}

function getZonaColor(z: ZonaPolygon): string {
  const key = z.etiqueta_zona || z.nombre || '';
  const match = Object.keys(COLORES_ZONA).find(k => key.toUpperCase().includes(k.replace('ZONA ', '')));
  return match ? COLORES_ZONA[match].stroke : '#94A3B8';
}

function getZonaFill(z: ZonaPolygon): string {
  const key = z.etiqueta_zona || z.nombre || '';
  const match = Object.keys(COLORES_ZONA).find(k => key.toUpperCase().includes(k.replace('ZONA ', '')));
  return match ? COLORES_ZONA[match].fill : '#94A3B820';
}

export default function MapEditor() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const leafletLayers = useRef<Map<string, any>>(new Map());
  const drawLayer = useRef<any>(null);
  const [zonas, setZonas] = useState<ZonaPolygon[]>([]);
  const [selected, setSelected] = useState<ZonaPolygon | null>(null);
  const [editForm, setEditForm] = useState({ nombre: '', precio: 0, zona: 'ZONA AZUL' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCols, setShowCols] = useState(true);
  const [showKml, setShowKml] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const Lref = useRef<any>(null);

  // ─── Cargar datos ──────────────────────────────────────────────────────────
  const loadZonas = useCallback(async () => {
    setLoading(true);
    const [{ data: cols }, { data: kmls }] = await Promise.all([
      supabase.from('colonias').select('id, nombre, precio, etiqueta_zona, geom').not('geom', 'is', null),
      supabase.from('zonas_kml').select('id, nombre, precio, activo, geom').eq('activo', true),
    ]);
    const lista: ZonaPolygon[] = [
      ...(cols || []).map(c => ({ ...c, tipo: 'colonia' as const })),
      ...(kmls || []).map(k => ({ ...k, tipo: 'kml' as const })),
    ];
    setZonas(lista);
    setLoading(false);
    return lista;
  }, []);

  // ─── Inicializar Leaflet ───────────────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      await import('@geoman-io/leaflet-geoman-free');
      await import('@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css');
      if (destroyed || !mapRef.current || leafletMap.current) return;

      Lref.current = L;

      const map = L.map(mapRef.current, {
        center: [16.25, -92.13],
        zoom: 13,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Geoman drawing tools
      (map as any).pm.addControls({
        position: 'topleft',
        drawMarker: false,
        drawCircle: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawRectangle: true,
        drawPolygon: true,
        editMode: true,
        dragMode: true,
        cutPolygon: false,
        removalMode: true,
        rotateMode: false,
      });

      leafletMap.current = map;

      // Escuchar cuando se termina de dibujar
      map.on('pm:create', async (e: any) => {
        const L2 = Lref.current;
        const layer = e.layer;
        const latlngs = (layer.getLatLngs()[0] as any[]).map((ll: any) => [ll.lat, ll.lng] as [number, number]);
        const wkt = latLngsToWKT(latlngs);
        setIsDrawing(false);

        // Guardar nuevo polígono en zonas_kml
        const nombre = `Nueva Zona ${Date.now().toString().slice(-4)}`;
        const { data, error } = await supabase.from('zonas_kml').insert({
          nombre,
          precio: 45,
          geom: `SRID=4326;${wkt}`,
          activo: true,
        }).select().single();

        if (error) {
          console.error('Error guardando nuevo polígono:', error);
          layer.remove();
          return;
        }

        // Remover el layer temporal y recargar todos
        layer.remove();
        const nuevasZonas = await loadZonas();
        const nueva = nuevasZonas.find(z => z.id === data.id);
        if (nueva) {
          setSelected(nueva);
          setEditForm({ nombre: nueva.nombre, precio: nueva.precio, zona: 'ZONA AZUL' });
        }
      });

      // Cargar los datos en el mapa
      const lista = await loadZonas();
      if (!destroyed) renderPolygons(lista, map, L);
    })();
    return () => { destroyed = true; };
  }, []);

  // ─── Renderizar polígonos en el mapa ──────────────────────────────────────
  const renderPolygons = useCallback((lista: ZonaPolygon[], map?: any, L?: any) => {
    const m = map || leafletMap.current;
    const Lib = L || Lref.current;
    if (!m || !Lib) return;

    // Limpiar layers anteriores
    leafletLayers.current.forEach(layer => layer.remove());
    leafletLayers.current.clear();

    // Ordenar: los polígonos más grandes primero (se renderizan debajo)
    const sorted = [...lista].sort((a, b) => {
      const areaA = calcArea(a.geom);
      const areaB = calcArea(b.geom);
      return areaB - areaA;
    });

    sorted.forEach(zona => {
      const latlngs = geomToLatLngs(zona.geom);
      if (!latlngs || latlngs.length < 3) return;

      const strokeColor = getZonaColor(zona);
      const fillColor = getZonaFill(zona);

      const polygon = Lib.polygon(latlngs, {
        color: strokeColor,
        fillColor: fillColor,
        weight: 2,
        opacity: 1,
        fillOpacity: 0.3,
        interactive: true,
      }).addTo(m);

      // Tooltip con nombre y precio
      polygon.bindTooltip(`<b>${zona.nombre}</b><br/>$${zona.precio}`, {
        permanent: false,
        direction: 'center',
        className: 'map-tooltip',
      });

      polygon.on('click', () => {
        setSelected(zona);
        setEditForm({
          nombre: zona.nombre,
          precio: zona.precio,
          zona: zona.etiqueta_zona || zona.nombre || 'ZONA AZUL',
        });
        // Resaltar
        polygon.setStyle({ weight: 4, color: '#fff' });
        setTimeout(() => polygon.setStyle({ weight: 2, color: strokeColor }), 1500);
      });

      leafletLayers.current.set(zona.id, polygon);
    });
  }, []);

  // Actualizar renderizado cuando cambian las zonas
  useEffect(() => {
    if (zonas.length > 0) renderPolygons(zonas);
  }, [zonas, showCols, showKml]);

  function calcArea(geom: GeoJSONGeometry | null): number {
    if (!geom?.coordinates?.[0]) return 0;
    const pts = geom.coordinates[0];
    let area = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    }
    return Math.abs(area / 2);
  }

  // ─── Guardar cambios ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    const zClean = editForm.zona.toLowerCase().replace('zona', '').trim();
    const nuevaZona = `ZONA ${zClean.toUpperCase()}`;

    try {
      if (selected.tipo === 'colonia') {
        await supabase.from('colonias').update({
          etiqueta_zona: nuevaZona,
          precio: editForm.precio,
          nombre: editForm.nombre,
        }).eq('id', selected.id);
      } else {
        await supabase.from('zonas_kml').update({
          nombre: editForm.nombre || nuevaZona,
          precio: editForm.precio,
        }).eq('id', selected.id);
      }
      setSuccessMsg('✅ Guardado');
      setTimeout(() => setSuccessMsg(''), 2000);
      await loadZonas();
      setSelected(null);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  // ─── Eliminar zona KML ─────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selected || selected.tipo !== 'kml') return;
    if (!confirm(`¿Eliminar "${selected.nombre}"?`)) return;
    await supabase.from('zonas_kml').delete().eq('id', selected.id);
    setSelected(null);
    await loadZonas();
  };

  const filtradas = zonas.filter(z =>
    z.nombre.toLowerCase().includes(searchText.toLowerCase())
  );

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: 'Inter, sans-serif', background: '#0f172a' }}>
      {/* Panel lateral */}
      <div style={{
        width: '320px', minWidth: '320px', height: '100vh', background: '#1e293b',
        display: 'flex', flexDirection: 'column', boxShadow: '4px 0 20px #0005', zIndex: 100,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>🗺️</span>
            <div>
              <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16 }}>Editor de Zonas</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>Estrella Mandaditos</div>
            </div>
          </div>
          <input
            placeholder="🔍 Buscar zona..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{
              width: '100%', background: '#0f172a', border: '1px solid #334155',
              borderRadius: 8, padding: '8px 12px', color: '#f1f5f9', fontSize: 13,
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Controles de capas */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #334155', display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowCols(v => !v)}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: showCols ? '#3B82F620' : '#1e293b', color: showCols ? '#3B82F6' : '#64748b',
              border: `1px solid ${showCols ? '#3B82F6' : '#334155'}` as any,
            }}>
            👥 Colonias
          </button>
          <button
            onClick={() => setShowKml(v => !v)}
            style={{
              flex: 1, padding: '6px 0', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: showKml ? '#F9731620' : '#1e293b', color: showKml ? '#F97316' : '#64748b',
              border: `1px solid ${showKml ? '#F97316' : '#334155'}` as any,
            }}>
            🗂️ Zonas KML
          </button>
        </div>

        {/* Lista de zonas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>Cargando zonas...</div>
          ) : filtradas.length === 0 ? (
            <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>No se encontraron zonas</div>
          ) : filtradas.map(z => {
            const isSelected = selected?.id === z.id;
            const color = getZonaColor(z);
            const visible = z.tipo === 'colonia' ? showCols : showKml;
            if (!visible) return null;
            return (
              <div
                key={z.id}
                onClick={() => {
                  setSelected(z);
                  setEditForm({ nombre: z.nombre, precio: z.precio, zona: z.etiqueta_zona || z.nombre || 'ZONA AZUL' });
                  // Centrar mapa
                  const layer = leafletLayers.current.get(z.id);
                  if (layer && leafletMap.current) leafletMap.current.fitBounds(layer.getBounds(), { padding: [40, 40] });
                }}
                style={{
                  padding: '10px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  background: isSelected ? '#334155' : 'transparent',
                  borderLeft: `3px solid ${isSelected ? color : 'transparent'}`,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {z.nombre}
                  </div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 1 }}>
                    ${z.precio} · {z.tipo === 'colonia' ? '👥 Colonia' : '🗂️ KML'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Panel de edición */}
        {selected && (
          <div style={{ borderTop: '1px solid #334155', padding: 16, background: '#0f172a' }}>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 10, letterSpacing: 1 }}>
              ✏️ Editando: {selected.tipo === 'colonia' ? '👥 Colonia' : '🗂️ KML'}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>Nombre</label>
              <input
                value={editForm.nombre}
                onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                style={{
                  width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
                  padding: '7px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>Precio ($)</label>
              <input
                type="number"
                value={editForm.precio}
                onChange={e => setEditForm(f => ({ ...f, precio: parseInt(e.target.value) || 0 }))}
                style={{
                  width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
                  padding: '7px 10px', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>Color de Zona</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {Object.entries(COLORES_ZONA).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => setEditForm(f => ({
                      ...f,
                      zona: key,
                      precio: f.precio === 0 || Object.values(PRECIO_DEFECTO_ZONA).includes(f.precio)
                        ? PRECIO_DEFECTO_ZONA[key] || f.precio
                        : f.precio
                    }))}
                    style={{
                      padding: '6px 8px', borderRadius: 6, border: `2px solid ${editForm.zona === key ? val.stroke : '#334155'}`,
                      background: editForm.zona === key ? `${val.stroke}30` : '#1e293b',
                      color: editForm.zona === key ? val.stroke : '#94a3b8',
                      cursor: 'pointer', fontSize: 11, fontWeight: 600, textAlign: 'center',
                    }}>
                    {val.label}
                  </button>
                ))}
              </div>
            </div>

            {successMsg && (
              <div style={{ background: '#16a34a20', border: '1px solid #16a34a', borderRadius: 6, padding: '8px 12px', color: '#4ade80', fontSize: 13, marginBottom: 10, textAlign: 'center' }}>
                {successMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  background: saving ? '#334155' : 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                }}>
                {saving ? '⏳ Guardando...' : '💾 Guardar'}
              </button>
              {selected.tipo === 'kml' && (
                <button
                  onClick={handleDelete}
                  style={{
                    padding: '9px 12px', borderRadius: 8, border: '1px solid #ef4444', cursor: 'pointer',
                    background: 'transparent', color: '#ef4444', fontSize: 13,
                  }}>
                  🗑️
                </button>
              )}
              <button
                onClick={() => setSelected(null)}
                style={{
                  padding: '9px 12px', borderRadius: 8, border: '1px solid #334155', cursor: 'pointer',
                  background: 'transparent', color: '#94a3b8', fontSize: 13,
                }}>
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid #334155', display: 'flex', gap: 16, background: '#0f172a' }}>
          <div style={{ color: '#64748b', fontSize: 11 }}>
            👥 <span style={{ color: '#3B82F6', fontWeight: 600 }}>{zonas.filter(z => z.tipo === 'colonia').length}</span> colonias
          </div>
          <div style={{ color: '#64748b', fontSize: 11 }}>
            🗂️ <span style={{ color: '#F97316', fontWeight: 600 }}>{zonas.filter(z => z.tipo === 'kml').length}</span> KML
          </div>
          <div style={{ color: '#64748b', fontSize: 11 }}>
            📍 <span style={{ color: '#22C55E', fontWeight: 600 }}>{zonas.length}</span> total
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {/* Instrucciones flotantes */}
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 1000,
          background: '#1e293bee', borderRadius: 10, padding: '10px 14px',
          color: '#94a3b8', fontSize: 12, backdropFilter: 'blur(8px)',
          border: '1px solid #334155',
        }}>
          <div style={{ color: '#f1f5f9', fontWeight: 600, marginBottom: 4 }}>Cómo usar:</div>
          <div>🖊️ Usa el menú izquierdo del mapa para dibujar</div>
          <div>🖱️ Clic en un polígono para editarlo</div>
          <div>💾 Guarda desde el panel izquierdo</div>
        </div>
      </div>

      {/* CSS adicional para tooltips */}
      <style>{`
        .map-tooltip {
          background: #1e293b !important;
          border: 1px solid #334155 !important;
          color: #f1f5f9 !important;
          font-family: Inter, sans-serif !important;
          font-size: 12px !important;
          border-radius: 6px !important;
          padding: 4px 8px !important;
        }
        .leaflet-control-zoom a, .leaflet-bar a {
          background: #1e293b !important;
          border-color: #334155 !important;
          color: #f1f5f9 !important;
        }
        .leaflet-container {
          background: #0f172a;
        }
      `}</style>
    </div>
  );
}
