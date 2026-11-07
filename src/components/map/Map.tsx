import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

export interface HotspotStyle {
  fillColor?: string;
  color?: string;
  radius?: number;
  fillOpacity?: number;
  popupBuilder?: (properties: any) => string;
}

export interface MapHandle {
  addBurnedAreaLayer: (id: string, geojson: any, options: { color: string; fillOpacity: number }) => Promise<void>;
  removeBurnedAreaLayer: (id: string) => void;
  addHotspotsLayer: (id: string, geojson: any, style?: HotspotStyle) => Promise<void>;
  removeHotspotsLayer: (id: string) => void;
  addTileLayer: (id: string, url: string, opts?: any) => Promise<void>;
  removeTileLayer: (id: string) => void;
  hideTileLayer: (id: string) => void;
  showTileLayer: (id: string) => void;
  addCompositeImageLayer: (tileUrl: string) => Promise<void>;
  getSelectedGeometry: () => any;
  clearDrawing: () => void;
  resetBurnedAreaStyles: () => void;
}

const Map = forwardRef<MapHandle>((_props, ref) => {
  const mapRef = useRef<any>(null);
  const drawnItemsRef = useRef<any>(null);
  const drawControlRef = useRef<any>(null);
  const [drawing, setDrawing] = useState(false);
  const geoJsonLayersRef = useRef<Record<string, any>>({});
  const hotspotLayersRef = useRef<Record<string, any>>({});
  const tileLayersRef = useRef<Record<string, any>>({});
  const imageLayerRef = useRef<any>(null);
  const legendControlRef = useRef<any>(null);

  const clearDrawings = () => {
    drawnItemsRef.current?.clearLayers();
    Object.values(geoJsonLayersRef.current).forEach((l) => l.resetStyle?.());
  };

  const emitGeometry = (layer: any) => {
    const geom = layer.toGeoJSON().geometry;
    document.dispatchEvent(new CustomEvent('geometryDrawn', { detail: geom }));
  };

  const addSeverityLegend = () => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!map) return;

    if (legendControlRef.current) map.removeControl(legendControlRef.current);

    legendControlRef.current = L.control({ position: 'bottomleft' });
    legendControlRef.current.onAdd = () => {
      const div = L.DomUtil.create('div', 'info legend severity-legend');

      const classes = [
        { name: 'Unburnt/Very-low', color: '#0000FF' },
        { name: 'Low', color: '#FFFF00' },
        { name: 'Moderate', color: '#FFA500' },
        { name: 'High', color: '#FF0000' },
        { name: 'Very-high', color: '#800000' }
      ];
      div.innerHTML += '<strong>Burn severity classes</strong><br>';
      classes.forEach(c => {
        div.innerHTML +=
          `<i style="
             background:${c.color};
             width:18px; height:18px;
             display:inline-block;
             margin-right:6px;
             border:1px solid #999;
           "></i> ${c.name}<br>`;
      });

      div.innerHTML += '<br><strong>Burn severity level</strong><br>';
      div.innerHTML +=
        `<div class="gradient-bar"></div>
         <div class="gradient-label top">Very-high severity</div>
         <div class="gradient-label bottom">Unburned/Very-low severity</div>`;

      return div;
    };
    legendControlRef.current.addTo(map);
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    addBurnedAreaLayer: async (id: string, geojson: any, options: { color: string; fillOpacity: number }) => {
      if (!mapRef.current) return;

      const L = (window as any).L;
      if (geoJsonLayersRef.current[id]) {
        mapRef.current.removeLayer(geoJsonLayersRef.current[id]);
      }

      const layer = L.geoJSON(geojson, {
        style: {
          color: options.color,
          fillOpacity: options.fillOpacity,
          weight: 2,
          fillColor: options.color,
        },
        onEachFeature: (feature: any, lyr: any) => {
          lyr.on('click', (e: any) => {
            if (drawing) return;

            clearDrawings();
            lyr.setStyle({
              color: 'yellow',
              weight: 4,
              fillOpacity: 0.7,
              fillColor: 'yellow',
            });

            emitGeometry(lyr);
            L.DomEvent.stopPropagation(e);
          });

          const fireDate = feature.properties?.fire_date ?? feature.properties?.data_inici ?? '—';
          const area = feature.properties?.area_ha ?? feature.properties?.area_ht ?? '—';

          lyr.bindPopup(`
            <div style="min-width: 200px;">
              <strong>📅 Data:</strong> ${fireDate}<br/>
              <strong>🔥 Área:</strong> ${area} ha<br/>
              <hr style="margin: 8px 0;">
              <button onclick="document.dispatchEvent(new CustomEvent('selectBurnedArea', {detail: '${id}'}))" 
                      style="background: #ff7800; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">
                ✓ Selecionar Esta Área
              </button>
            </div>
          `);

          lyr.on('mouseover', () => {
            if (lyr.options.color !== 'yellow') {
              lyr.setStyle({
                weight: 3,
                fillOpacity: options.fillOpacity + 0.2,
              });
            }
          });

          lyr.on('mouseout', () => {
            if (lyr.options.color !== 'yellow') {
              lyr.setStyle({
                weight: 2,
                fillOpacity: options.fillOpacity,
              });
            }
          });
        },
      }).addTo(mapRef.current);

      geoJsonLayersRef.current[id] = layer;
    },

    removeBurnedAreaLayer: (id: string) => {
      if (geoJsonLayersRef.current[id]) {
        mapRef.current.removeLayer(geoJsonLayersRef.current[id]);
        delete geoJsonLayersRef.current[id];
      }
    },

    addHotspotsLayer: async (id: string, geojson: any, style?: HotspotStyle) => {
      if (!mapRef.current) return;

      const L = (window as any).L;

      if (hotspotLayersRef.current[id]) {
        mapRef.current.removeLayer(hotspotLayersRef.current[id]);
        delete hotspotLayersRef.current[id];
      }

      const defaultBuilder = (p: any) => {
        const confidence = p.confidence ?? 'n/a';
        const frp = p.frp ?? 'n/a';
        const datetime = p.datetime ?? p.acq_date ?? 'n/a';
        const source = p.source_dataset ?? 'FIRMS';
        return `
          <div style="min-width: 220px;">
            <strong>FIRMS hotspot</strong><br/>
            <strong>Date/Time:</strong> ${datetime}<br/>
            <strong>Confidence:</strong> ${confidence}<br/>
            <strong>FRP:</strong> ${frp}<br/>
            <strong>Dataset:</strong> ${source}
          </div>
        `;
      };

      const popupBuilder = style?.popupBuilder ?? defaultBuilder;

      const hotspotLayer = L.geoJSON(geojson, {
        pointToLayer: (_feature: any, latlng: any) => {
          return L.circleMarker(latlng, {
            radius: style?.radius ?? 6,
            fillColor: style?.fillColor ?? '#ef4444',
            color: style?.color ?? '#991b1b',
            weight: 1,
            opacity: 1,
            fillOpacity: style?.fillOpacity ?? 0.8,
          });
        },
        onEachFeature: (feature: any, layer: any) => {
          layer.on('click', (e: any) => {
            emitGeometry(layer);
            L.DomEvent.stopPropagation(e);
          });

          layer.bindPopup(popupBuilder(feature.properties ?? {}));
        },
      }).addTo(mapRef.current);

      hotspotLayersRef.current[id] = hotspotLayer;
    },

    removeHotspotsLayer: (id: string) => {
      if (hotspotLayersRef.current[id]) {
        mapRef.current.removeLayer(hotspotLayersRef.current[id]);
        delete hotspotLayersRef.current[id];
      }
    },

    addTileLayer: async (id: string, url: string, opts = {}) => {
      const L = (window as any).L;
      if (tileLayersRef.current[id]) {
        mapRef.current.removeLayer(tileLayersRef.current[id]);
        delete tileLayersRef.current[id];
      }

      tileLayersRef.current[id] = L.tileLayer(url, opts).addTo(mapRef.current);

      if (id.startsWith('severity-')) {
        addSeverityLegend();
      }
    },

    removeTileLayer: (id: string) => {
      if (tileLayersRef.current[id]) {
        mapRef.current.removeLayer(tileLayersRef.current[id]);
        delete tileLayersRef.current[id];
      }
    },

    hideTileLayer: (id: string) => {
      if (tileLayersRef.current[id]) {
        mapRef.current.removeLayer(tileLayersRef.current[id]);
      }
    },

    showTileLayer: (id: string) => {
      if (tileLayersRef.current[id] && !mapRef.current.hasLayer(tileLayersRef.current[id])) {
        mapRef.current.addLayer(tileLayersRef.current[id]);
      }
    },

    addCompositeImageLayer: async (tileUrl: string) => {
      const L = (window as any).L;
      if (imageLayerRef.current) {
        mapRef.current.removeLayer(imageLayerRef.current);
      }
      imageLayerRef.current = L.tileLayer(tileUrl, { opacity: 0.7 }).addTo(mapRef.current);
      addSeverityLegend();
    },

    getSelectedGeometry: () => {
      if (!drawnItemsRef.current || drawnItemsRef.current.getLayers().length === 0) return null;
      return drawnItemsRef.current.getLayers()[0].toGeoJSON().geometry;
    },

    clearDrawing: () => {
      clearDrawings();
    },

    resetBurnedAreaStyles: () => {
      Object.values(geoJsonLayersRef.current).forEach((layer) => {
        if (layer.resetStyle) {
          layer.resetStyle();
        }
      });
    }
  }));

  useEffect(() => {
    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return;

    let cancelled = false;
    let localMap: any = null;
    let startDrawHandlerRef: ((evt: any) => void) | null = null;

    const initMap = async () => {
      // Load Leaflet dynamically
      const L = (await import('leaflet')).default;
      (window as any).L = L;

      // Load leaflet-draw
      await import('leaflet-draw');

      if (cancelled) return;

      // Reset any pre-existing Leaflet binding on the container (StrictMode double-mount safety)
      const container = document.getElementById('map') as (HTMLElement & { _leaflet_id?: number | null }) | null;
      if (container?._leaflet_id != null) {
        container._leaflet_id = null;
      }

      // Create map
      const map = L.map('map').setView([39.5, -8], 7);
      localMap = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map);

      mapRef.current = map;

      // Setup drawing flags
      map.on(L.Draw.Event.DRAWSTART, () => setDrawing(true));
      map.on(L.Draw.Event.DRAWSTOP, () => setDrawing(false));

      // Drawn items group
      const drawnItems = new L.FeatureGroup().addTo(map);
      drawnItemsRef.current = drawnItems;

      // Add draw control after a delay
      setTimeout(() => {
        const drawControl = new (L.Control as any).Draw({
          position: 'topright',
          draw: {
            polyline: false,
            circle: false,
            circlemarker: false,
            marker: false,
            rectangle: {
              shapeOptions: {
                color: '#ff7800',
                weight: 2,
                fillOpacity: 0.2,
              },
            },
            polygon: {
              allowIntersection: true,
              showArea: true,
              drawError: {
                color: '#e1e100',
                message: '<strong>Erro:</strong> Forma inválida!',
              },
              shapeOptions: {
                color: '#ff7800',
                weight: 2,
                fillOpacity: 0.2,
              },
              repeatMode: false,
              showLength: true,
              metric: true,
              feet: false,
            },
          },
          edit: {
            featureGroup: drawnItems,
            remove: true,
            edit: {},
          },
        });

        try {
          map.addControl(drawControl);
          drawControlRef.current = drawControl;
          console.log('Controlo de desenho adicionado com sucesso');
        } catch (error) {
          console.error('Erro ao adicionar controlo de desenho:', error);
        }
      }, 100);

      // Drawing events
      map.on(L.Draw.Event.CREATED, (e: any) => {
        console.log('Desenho criado:', e.layerType, e.layer);
        clearDrawings();
        drawnItems.addLayer(e.layer);

        if (e.layerType === 'rectangle') {
          const rectHandler = drawControlRef.current?._toolbars.draw._modes.rectangle?.handler;
          if (rectHandler) {
            rectHandler.setOptions({ useSquare: false });
          }
        }

        emitGeometry(e.layer);
      });

      map.on(L.Draw.Event.DRAWSTART, (e: any) => {
        console.log('Início do desenho:', e.layerType);
        clearDrawings();
      });

      map.on(L.Draw.Event.DRAWSTOP, (e: any) => {
        console.log('Fim do desenho:', e.layerType);
        if (e.layerType === 'rectangle') {
          const rectHandler = drawControlRef.current?._toolbars.draw._modes.rectangle?.handler;
          if (rectHandler) {
            rectHandler.setOptions({ useSquare: false });
          }
        }
      });

      map.on(L.Draw.Event.DRAWVERTEX, (e: any) => {
        console.log('Vértice adicionado:', e);
      });

      map.on(L.Draw.Event.EDITVERTEX, (e: any) => {
        console.log('Vértice editado:', e);
      });

      // Map click
      map.on('click', ({ latlng }: any) => {
        if (!drawing) {
          document.dispatchEvent(
            new CustomEvent('mapClicked', {
              detail: { lat: latlng.lat, lon: latlng.lng },
            })
          );
        }
      });

      // Listen for drawing requests
      startDrawHandlerRef = (evt: any) => {
        const mode: 'burned' | 'polygon' | 'square' = evt.detail;
        clearDrawings();

        switch (mode) {
          case 'polygon': {
            console.log('Ativando modo polígono');
            const polygonHandler = drawControlRef.current?._toolbars.draw._modes.polygon?.handler;
            if (polygonHandler) {
              polygonHandler.setOptions({
                allowIntersection: true,
                showArea: true,
                shapeOptions: {
                  color: '#ff7800',
                  weight: 2,
                  fillOpacity: 0.2,
                }
              });
              polygonHandler.enable();
            } else {
              console.error('Handler do polígono não encontrado');
            }
            break;
          }

          case 'square': {
            const rectHandler = drawControlRef.current?._toolbars.draw._modes.rectangle?.handler;
            if (rectHandler) {
              rectHandler.setOptions({ useSquare: true });
              rectHandler.enable();
            }
            break;
          }
        }
      };

      document.addEventListener('startDraw', startDrawHandlerRef);
    };

    initMap();

    return () => {
      cancelled = true;
      if (startDrawHandlerRef) {
        document.removeEventListener('startDraw', startDrawHandlerRef);
      }
      if (localMap) {
        try { localMap.remove(); } catch { /* ignore */ }
      }
      mapRef.current = null;
    };
  }, []);

  return (
    <>
      <div id="map" style={{ width: '100%', height: '100%', minHeight: '400px' }}></div>
      <style>{`
        #map {
          width: 100%;
          height: 100%;
          min-height: 400px;
          z-index: 0;
        }

        .leaflet-draw-toolbar {
          display: block !important;
          visibility: visible !important;
        }

        .leaflet-draw-toolbar a {
          background-color: white !important;
          border: 1px solid #ccc !important;
          color: #333 !important;
          text-decoration: none !important;
          width: 26px !important;
          height: 26px !important;
          line-height: 26px !important;
          display: block !important;
          text-align: center !important;
          border-radius: 4px !important;
          margin-bottom: 5px !important;
        }

        .leaflet-draw-toolbar a:hover {
          background-color: #f4f4f4 !important;
        }

        .leaflet-draw {
          z-index: 1000 !important;
        }

        .leaflet-popup-content {
          margin: 8px 12px;
          line-height: 1.4;
        }

        .leaflet-popup-content button:hover {
          background: #e66700 !important;
        }

        .info.legend {
          background: white;
          padding: 6px 8px;
          box-shadow: 0 0 15px rgba(0,0,0,0.2);
          border-radius: 5px;
          font-size: 12px;
          line-height: 18px;
          color: #555;
          z-index: 2000;
        }

        .info.legend i {
          border: 1px solid #999;
        }

        .info.legend.severity-legend {
          padding: 8px;
          background: white;
          line-height: 1.4;
          color: #555;
          font-size: 12px;
          box-shadow: 0 0 15px rgba(0,0,0,0.2);
          border-radius: 5px;
          z-index: 2000;
        }

        .info.legend.severity-legend .gradient-bar {
          width: 20px;
          height: 100px;
          margin: 6px auto 0 auto;
          background: linear-gradient(
            to bottom,
            #800000,
            #FF0000,
            #FFA500,
            #FFFF00,
            #0000FF
          );
          border: 1px solid #999;
        }

        .info.legend.severity-legend .gradient-label {
          text-align: center;
          font-size: 11px;
          margin: 2px 0;
        }

        .info.legend.severity-legend .gradient-label.top {
          margin-top: 4px;
        }

        .info.legend.severity-legend .gradient-label.bottom {
          margin-bottom: 4px;
        }
      `}</style>
    </>
  );
});

Map.displayName = 'Map';

export default Map;
