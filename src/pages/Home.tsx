import { useState, useEffect, useRef, CSSProperties, useMemo } from 'react';
import Map, { MapHandle } from '../components/map/Map';
import FireAnalyst from '../components/analyst/FireAnalyst';
import ResultsPanel, { SeriesPoint, SeverityPoint } from '../components/analyst/ResultsPanel';
import ChatWidget from '../components/ChatBot/ChatWidget';
import InfoDialog from '../components/tutorials/InfoDialog';
import { color, radius, space, shadow } from '../styles/theme';
import { useMediaQuery, MOBILE_QUERY } from '../hooks/useMediaQuery';

const s: Record<string, CSSProperties> = {
  root: {
    display: 'flex',
    height: '100vh',
    flexDirection: 'column',
    background: color.bgRoot,
    color: color.text,
  },
  header: {
    padding: `${space(3)} ${space(5)}`,
    background: `linear-gradient(120deg, ${color.bgPanel} 0%, ${color.bgRoot} 100%)`,
    borderBottom: `1px solid ${color.border}`,
    display: 'flex',
    gap: space(3),
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  brand: {
    fontSize: '1.05rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    display: 'flex',
    alignItems: 'center',
    gap: space(2),
  },
  brandDot: {
    width: 8, height: 8, borderRadius: radius.pill, background: color.primary,
    boxShadow: `0 0 10px ${color.primary}`,
  },
  body: { display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 },
  sidebar: {
    width: 360,
    background: color.bgPanel,
    padding: space(4),
    overflowY: 'auto',
    borderRight: `1px solid ${color.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: space(3),
  },
  card: {
    background: color.bgRaised,
    border: `1px solid ${color.border}`,
    borderRadius: radius.lg,
    padding: space(3),
  },
  cardAnalyst: {
    background: `linear-gradient(145deg, ${color.bgRaised} 0%, rgba(249,115,22,0.05) 100%)`,
    border: `1px solid ${color.border}`,
    borderRadius: radius.lg,
    padding: space(3),
    position: 'relative',
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: '0.72rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: color.textMuted,
    marginBottom: space(2),
  },
  label: {
    display: 'block',
    fontSize: '0.72rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: color.textFaint,
    marginBottom: space(1),
  },
  field: { marginBottom: space(3) },
  hint: { fontSize: '0.8rem', color: color.textFaint, lineHeight: 1.4 },
  input: {
    width: '100%',
    background: color.bgInput,
    color: color.text,
    border: `1px solid ${color.borderSoft}`,
    borderRadius: radius.md,
    padding: `${space(2)} ${space(2)}`,
    fontSize: '0.85rem',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    colorScheme: 'dark',
  },
  select: {
    width: '100%',
    background: color.bgInput,
    color: color.text,
    border: `1px solid ${color.borderSoft}`,
    borderRadius: radius.md,
    padding: `${space(2)} ${space(2)}`,
    fontSize: '0.85rem',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(color.textMuted)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 30,
  },
  btnSecondary: {
    padding: `${space(2)} ${space(3)}`,
    background: color.bgHover,
    color: color.text,
    border: `1px solid ${color.borderSoft}`,
    borderRadius: radius.md,
    fontSize: '0.82rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnGhost: {
    padding: `${space(2)} ${space(3)}`,
    background: 'transparent',
    color: color.textMuted,
    border: `1px solid ${color.borderSoft}`,
    borderRadius: radius.md,
    fontSize: '0.82rem',
    cursor: 'pointer',
  },
  main: { flex: 1, position: 'relative', minWidth: 0 },
  mapWrap: { position: 'absolute', inset: 0 },
  panelToggle: {
    position: 'absolute',
    top: space(4),
    right: space(4),
    zIndex: 400,
    background: 'rgba(17, 24, 39, 0.85)',
    color: color.text,
    border: `1px solid ${color.borderSoft}`,
    borderRadius: radius.pill,
    padding: `${space(2)} ${space(3)}`,
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: space(2),
    boxShadow: shadow.md,
  },
  panelToggleDot: {
    width: 7, height: 7, borderRadius: '50%',
    background: color.primary,
    boxShadow: `0 0 8px ${color.primary}`,
  },
  sectionLabel: {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: color.textFaint,
    marginTop: space(2),
    marginBottom: space(1),
    paddingLeft: space(1),
  },
  hamburger: {
    background: color.bgRaised,
    color: color.text,
    border: `1px solid ${color.borderSoft}`,
    borderRadius: radius.md,
    width: 44,
    height: 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.1rem',
    cursor: 'pointer',
  },
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    zIndex: 999,
  },
  drawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space(2),
  },
  drawerClose: {
    background: 'transparent',
    color: color.textMuted,
    border: `1px solid ${color.borderSoft}`,
    borderRadius: radius.md,
    width: 36,
    height: 36,
    fontSize: '1.1rem',
    cursor: 'pointer',
  },
};

const dyn = {
  status: (ok: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: space(1),
    fontSize: '0.72rem',
    padding: `${space(1)} ${space(2)}`,
    borderRadius: radius.pill,
    background: ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
    color: ok ? color.success : color.danger,
    border: `1px solid ${ok ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
    fontWeight: 500,
  }),
  statusDot: (ok: boolean): CSSProperties => ({
    width: 6, height: 6, borderRadius: radius.pill,
    background: ok ? color.success : color.danger,
    boxShadow: `0 0 6px ${ok ? color.success : color.danger}`,
  }),
  note: (tone: 'ok' | 'warn' | 'info'): CSSProperties => {
    const map = {
      ok:   { bg: 'rgba(16,185,129,0.08)', fg: color.success, border: 'rgba(16,185,129,0.25)' },
      warn: { bg: 'rgba(245,158,11,0.08)', fg: color.warning, border: 'rgba(245,158,11,0.25)' },
      info: { bg: 'rgba(56,189,248,0.08)', fg: color.accent,  border: 'rgba(56,189,248,0.25)' },
    }[tone];
    return {
      background: map.bg,
      color: map.fg,
      border: `1px solid ${map.border}`,
      borderRadius: radius.md,
      padding: `${space(2)} ${space(3)}`,
      fontSize: '0.82rem',
      lineHeight: 1.4,
    };
  },
};

function Home() {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [selectedSatellite, setSelectedSatellite] = useState('');
  const [selectedIndex, setSelectedIndex] = useState('');

  const [selectedGeometry, setSelectedGeometry] = useState<any>(null);
  const mapComponentRef = useRef<MapHandle>(null);

  // FIRMS status
  const [firmsConfigured, setFirmsConfigured] = useState<boolean | null>(null);
  const [firmsLoading, setFirmsLoading] = useState(false);
  const [firmsMessage, setFirmsMessage] = useState('');
  const [liveHotspotsCount, setLiveHotspotsCount] = useState<number>(0);

  // GEE capability status
  const [geeConfigured, setGeeConfigured] = useState<boolean | null>(null);
  const [geeMessage, setGeeMessage] = useState('');

  // ANEPC / fogos.pt
  const [fogosLoading, setFogosLoading] = useState(false);
  const [fogosMessage, setFogosMessage] = useState('');
  const [fogosCount, setFogosCount] = useState(0);

  // MODIS burned areas (last completed fire season by default)
  const lastFireSeasonYear = new Date().getFullYear() - 1;
  const [baFrom, setBaFrom] = useState(`${lastFireSeasonYear}-06-01`);
  const [baTo, setBaTo] = useState(`${lastFireSeasonYear}-09-30`);
  const [baLoading, setBaLoading] = useState(false);
  const [baMessage, setBaMessage] = useState('');
  const [baMessageTone, setBaMessageTone] = useState<'ok' | 'warn' | 'info'>('info');

  // Recent perimeter derived from a clicked fire point or drawn geometry
  const [recentPerimeterLoading, setRecentPerimeterLoading] = useState(false);
  const [recentPerimeterCount, setRecentPerimeterCount] = useState(0);
  const [recentPerimeterMessage, setRecentPerimeterMessage] = useState('');
  const [recentPerimeterTone, setRecentPerimeterTone] = useState<'ok' | 'warn' | 'info'>('info');

  // ICNF burned areas (official PT, validated, 1975-2025)
  const [icnfYears, setIcnfYears] = useState<string[]>([]);
  const [icnfYear, setIcnfYear] = useState<string>(String(lastFireSeasonYear));
  const [icnfLoading, setIcnfLoading] = useState(false);
  const [icnfMessage, setIcnfMessage] = useState('');
  const [icnfMessageTone, setIcnfMessageTone] = useState<'ok' | 'warn' | 'info'>('info');
  const [icnfCount, setIcnfCount] = useState(0);
  const [baCount, setBaCount] = useState(0);
  const [baCoverage, setBaCoverage] = useState<{ earliest: string; latest: string } | null>(null);

  // Analyst configuration
  const [fireDate, setFireDate] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [windowSize, setWindowSize] = useState(30);

  // Analyst results (lifted from FireAnalyst so the drawer can display them)
  const [timeSeries, setTimeSeries] = useState<SeriesPoint[]>([]);
  const [severity, setSeverity] = useState<SeverityPoint[]>([]);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);

  const satelliteLabels = {
    MODIS: 'Terra/MODIS',
    Landsat5: 'Landsat-5/TM',
    Landsat7: 'Landsat-7/ETM',
    Landsat8: 'Landsat-8/OLI',
    Landsat9: 'Landsat-9/OLI',
    Sentinel2: 'Sentinel-2/MSI',
    HLS: 'HLS (S2+L8)',
  };
  const satellites = Object.values(satelliteLabels);
  const indices = ['NBR', 'NDVI'];

  const geometryLabel = useMemo(() => {
    if (!selectedGeometry) return undefined;
    const type = selectedGeometry.type || 'Geometry';
    return `${type} selecionada`;
  }, [selectedGeometry]);

  useEffect(() => {
    const handleGeometryDrawn = (e: Event) => {
      setSelectedGeometry((e as CustomEvent).detail);
    };
    document.addEventListener('geometryDrawn', handleGeometryDrawn);
    return () => document.removeEventListener('geometryDrawn', handleGeometryDrawn);
  }, []);

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  const touch = (base: CSSProperties): CSSProperties =>
    isMobile ? { ...base, minHeight: 44 } : base;

  const sidebarStyle: CSSProperties = isMobile
    ? {
        ...s.sidebar,
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: 'min(360px, 86vw)',
        zIndex: 1000,
        transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 240ms cubic-bezier(.2,.8,.2,1)',
        boxShadow: drawerOpen ? shadow.lg : 'none',
        borderRight: `1px solid ${color.border}`,
      }
    : s.sidebar;

  const checkFirmsStatus = async () => {
    setFirmsLoading(true);
    setFirmsMessage('A verificar ligação FIRMS...');
    try {
      const res = await fetch('/api/firms/status');
      const data = await res.json();
      setFirmsConfigured(Boolean(data.configured));
      setFirmsMessage(data.configured
        ? 'FIRMS ligado e pronto.'
        : 'Chave FIRMS em falta. Adiciona FIRMS_MAP_KEY ao .env e reinicia o servidor.');
    } catch (err) {
      console.error(err);
      setFirmsConfigured(false);
      setFirmsMessage('Não foi possível contactar o FIRMS agora.');
    } finally {
      setFirmsLoading(false);
    }
  };

  const loadLiveHotspots = async () => {
    setFirmsLoading(true);
    setFirmsMessage('A carregar hotspots ao vivo...');
    try {
      const res = await fetch('/api/firms/active?dataset=VIIRS_SNPP_NRT&bbox=-10.0,36.8,-6.0,42.3&days=1');
      const data = await res.json();
      if (!res.ok) { setFirmsMessage(data.error || 'Não foi possível carregar hotspots.'); return; }
      await mapComponentRef.current?.addHotspotsLayer('firms-live', data.geojson);
      setLiveHotspotsCount(data.count ?? 0);
      setFirmsMessage(`${data.count ?? 0} hotspots carregados.`);
    } catch (err) {
      console.error(err);
      setFirmsMessage('Erro ao carregar hotspots.');
    } finally {
      setFirmsLoading(false);
    }
  };

  const clearLiveHotspots = () => {
    mapComponentRef.current?.removeHotspotsLayer('firms-live');
    setLiveHotspotsCount(0);
    setFirmsMessage('Hotspots removidos.');
  };

  const loadActiveFogos = async () => {
    setFogosLoading(true);
    setFogosMessage('A carregar ocorrências ANEPC...');
    try {
      const res = await fetch('/api/fogos/active?onlyActive=true&onlyFires=true');
      const data = await res.json();
      if (!res.ok) { setFogosMessage(data.error || 'Não foi possível carregar ocorrências.'); return; }
      await mapComponentRef.current?.addHotspotsLayer('fogos-active', data.geojson, {
        fillColor: '#f97316',
        color: '#9a3412',
        radius: 8,
        fillOpacity: 0.85,
        popupBuilder: (p: any) => `
          <div style="min-width: 240px;">
            <strong>🔥 ${p.natureza ?? 'Ocorrência'}</strong><br/>
            <strong>Local:</strong> ${p.location ?? '—'}<br/>
            <strong>Estado:</strong> <span style="color:#${p.statusColor ?? '666'}">${p.status ?? '—'}</span><br/>
            <strong>Início:</strong> ${p.datetime ?? '—'}<br/>
            <strong>Meios:</strong> 👤 ${p.man} • 🚒 ${p.terrain} • ✈️ ${p.aerial}<br/>
            <strong>Fonte:</strong> ANEPC (fogos.pt)
          </div>`,
      });
      setFogosCount(data.count ?? 0);
      setFogosMessage(`${data.count ?? 0} ativas (de ${data.totalItems ?? 0} totais).`);
    } catch (err) {
      console.error(err);
      setFogosMessage('Erro de rede ao carregar ANEPC.');
    } finally {
      setFogosLoading(false);
    }
  };

  const clearFogos = () => {
    mapComponentRef.current?.removeHotspotsLayer('fogos-active');
    setFogosCount(0);
    setFogosMessage('Ocorrências removidas.');
  };

  const loadModisBurned = async () => {
    if (!geeConfigured) {
      setBaLoading(false);
      setBaMessageTone('warn');
      setBaMessage('MODIS MCD64A1 está desativado porque faltam credenciais GEE.');
      return;
    }

    setBaLoading(true);
    setBaMessageTone('info');
    setBaMessage('A vectorizar áreas ardidas MODIS (alguns segundos)...');
    try {
      const res = await fetch(`/api/gee/modis-burned-areas?from=${baFrom}&to=${baTo}`);
      const data = await res.json();
      if (!res.ok) { setBaMessageTone('warn'); setBaMessage(data.message || data.error || 'Erro no MCD64A1.'); return; }
      if (data.coverage) setBaCoverage(data.coverage);
      if (!data.geojson || data.count === 0) {
        mapComponentRef.current?.removeBurnedAreaLayer('modis-burned');
        setBaCount(0);
        setBaMessageTone('warn');
        setBaMessage(data.note || `0 patches em Portugal entre ${baFrom} e ${baTo}. Tenta Jun-Set de um ano recente.`);
        return;
      }
      await mapComponentRef.current?.addBurnedAreaLayer('modis-burned', data.geojson, {
        color: '#dc2626',
        fillOpacity: 0.35,
      });
      setBaCount(data.count);
      setBaMessageTone('ok');
      setBaMessage(`${data.count} áreas · ~${data.totalBurnedKm2 ?? 0} km². Último disponível: ${data.coverage?.latest ?? '—'}. Clica num polígono para detalhes.`);
    } catch (err) {
      console.error(err);
      setBaMessageTone('warn');
      setBaMessage('Erro de rede no MCD64A1.');
    } finally {
      setBaLoading(false);
    }
  };

  const clearBurnedAreas = () => {
    mapComponentRef.current?.removeBurnedAreaLayer('modis-burned');
    setBaCount(0);
    setBaMessage('Áreas ardidas removidas.');
  };

  const deriveRecentPerimeter = async () => {
    if (!selectedGeometry) {
      setRecentPerimeterTone('warn');
      setRecentPerimeterMessage('Seleciona uma geometria ou clica num ponto de incêndio primeiro.');
      return;
    }

    if (!fireDate) {
      setRecentPerimeterTone('warn');
      setRecentPerimeterMessage('Define a data do incêndio antes de derivar o perímetro.');
      return;
    }

    setRecentPerimeterLoading(true);
    setRecentPerimeterTone('info');
    setRecentPerimeterMessage('A derivar perímetro recente com Sentinel-2 dNBR...');

    try {
      const res = await fetch('/api/gee/derive-perimeter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geometry: selectedGeometry,
          fireDate,
          satellite: 'Sentinel-2/MSI',
          preDays: 14,
          postDays: 21,
          bufferMeters: 3000,
          burnThreshold: 0.12,
          minAreaHa: 5,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRecentPerimeterTone('warn');
        setRecentPerimeterMessage(data.error || data.message || 'Falha a derivar o perímetro.');
        return;
      }

      if (!data.geojson || data.count === 0) {
        mapComponentRef.current?.removeBurnedAreaLayer('recent-perimeter');
        setRecentPerimeterCount(0);
        setRecentPerimeterTone('warn');
        setRecentPerimeterMessage(data.note || 'Sem polígonos derivados nesta janela.');
        return;
      }

      await mapComponentRef.current?.addBurnedAreaLayer('recent-perimeter', data.geojson, {
        color: '#ea580c',
        fillOpacity: 0.3,
      });

      setRecentPerimeterCount(data.count);
      setRecentPerimeterTone('ok');
      setRecentPerimeterMessage(
        `${data.count} polígonos derivados por dNBR. Janela pré ${data.preWindow?.from ?? '—'} → ${data.preWindow?.to ?? '—'}, pós ${data.postWindow?.from ?? '—'} → ${data.postWindow?.to ?? '—'}.`,
      );
    } catch (err) {
      console.error(err);
      setRecentPerimeterTone('warn');
      setRecentPerimeterMessage('Erro de rede ao derivar o perímetro recente.');
    } finally {
      setRecentPerimeterLoading(false);
    }
  };

  const clearRecentPerimeter = () => {
    mapComponentRef.current?.removeBurnedAreaLayer('recent-perimeter');
    setRecentPerimeterCount(0);
    setRecentPerimeterMessage('Perímetro recente removido.');
  };

  const loadIcnfYears = async () => {
    try {
      const res = await fetch('/api/icnf/years');
      const data = await res.json();
      if (Array.isArray(data.years)) setIcnfYears(data.years);
    } catch (err) {
      console.error('ICNF years load error:', err);
    }
  };

  const checkGeeStatus = async () => {
    try {
      const res = await fetch('/api/gee/status');
      const data = await res.json();
      setGeeConfigured(Boolean(data.configured));
      setGeeMessage(
        data.configured
          ? 'GEE ligado e pronto.'
          : 'GEE opcional desativado: adiciona GEE_PRIVATE_KEY ou o ficheiro de chave para ativar MODIS e análises Sentinel-2.',
      );
    } catch (err) {
      console.error('GEE status load error:', err);
      setGeeConfigured(false);
      setGeeMessage('Não foi possível verificar o estado do GEE agora.');
    }
  };

  const loadIcnf = async () => {
    setIcnfLoading(true);
    setIcnfMessageTone('info');
    setIcnfMessage(`A carregar áreas ardidas ICNF de ${icnfYear}...`);
    try {
      const res = await fetch(`/api/icnf/burned-areas?year=${encodeURIComponent(icnfYear)}`);
      const data = await res.json();
      if (!res.ok) {
        setIcnfMessageTone('warn');
        setIcnfMessage(data.error || 'Erro a carregar ICNF.');
        return;
      }
      if (!data.geojson || data.count === 0) {
        mapComponentRef.current?.removeBurnedAreaLayer('icnf-burned');
        setIcnfCount(0);
        setIcnfMessageTone('warn');
        setIcnfMessage(`Sem registos ICNF para ${icnfYear}.`);
        return;
      }
      await mapComponentRef.current?.addBurnedAreaLayer('icnf-burned', data.geojson, {
        color: '#7c3aed',
        fillOpacity: 0.4,
      });
      setIcnfCount(data.count);
      setIcnfMessageTone('ok');
      const cachedNote = data.cached ? ' (cache)' : '';
      setIcnfMessage(`${data.count} polígonos validados em ${icnfYear}${cachedNote}. Clica num polígono para detalhes.`);
    } catch (err) {
      console.error(err);
      setIcnfMessageTone('warn');
      setIcnfMessage('Erro de rede ao carregar ICNF.');
    } finally {
      setIcnfLoading(false);
    }
  };

  const clearIcnf = () => {
    mapComponentRef.current?.removeBurnedAreaLayer('icnf-burned');
    setIcnfCount(0);
    setIcnfMessage('Áreas ICNF removidas.');
  };

  const handleTimeSeriesReady = (points: SeriesPoint[]) => {
    setTimeSeries(points);
    setResultsOpen(true);
  };
  const handleSeverityReady = (pts: SeverityPoint[]) => {
    setSeverity(pts);
    setResultsOpen(true);
  };

  useEffect(() => { checkFirmsStatus(); }, []);
  useEffect(() => { checkGeeStatus(); }, []);
  useEffect(() => { loadIcnfYears(); }, []);

  const hasResults = timeSeries.length > 0 || severity.length > 0;

  return (
    <div style={s.root}>
      <header style={isMobile ? { ...s.header, padding: `${space(2)} ${space(3)}`, gap: space(2) } : s.header}>
        {isMobile && (
          <button
            onClick={() => setDrawerOpen(true)}
            style={s.hamburger}
            aria-label="Abrir controlos"
          >
            ☰
          </button>
        )}

        <div style={s.brand}>
          <span style={s.brandDot} />
          FireAnalyst {!isMobile && <span style={{ color: color.textMuted, fontWeight: 400 }}>• Portugal</span>}
        </div>

        {!isMobile && (
          <>
            <span style={dyn.status(Boolean(firmsConfigured))}>
              <span style={dyn.statusDot(Boolean(firmsConfigured))} />
              FIRMS {firmsConfigured ? 'ligado' : 'sem chave'}
            </span>

            <span style={dyn.status(Boolean(selectedGeometry))}>
              <span style={dyn.statusDot(Boolean(selectedGeometry))} />
              {selectedGeometry ? 'Área selecionada' : 'Sem área'}
            </span>
          </>
        )}

        <div style={{ marginLeft: 'auto' }}>
          <InfoDialog docPath="/tutorials/analyst_tutorial.txt" />
        </div>
      </header>

      <div style={s.body}>
        {isMobile && drawerOpen && (
          <div style={s.backdrop} onClick={() => setDrawerOpen(false)} aria-hidden />
        )}
        <aside style={sidebarStyle} aria-hidden={isMobile && !drawerOpen}>
          {isMobile && (
            <div style={s.drawerHeader}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: color.textMuted }}>
                Controlos
              </span>
              <button
                onClick={() => setDrawerOpen(false)}
                style={s.drawerClose}
                aria-label="Fechar controlos"
              >
                ×
              </button>
            </div>
          )}
          {/* 1. LIVE FIRES — primary */}
          <div style={s.sectionLabel}>Fogos ao vivo</div>
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(1) }}>
              <div style={s.cardTitle}>ANEPC · fogos.pt</div>
              <span style={{ fontSize: '0.7rem', color: color.textFaint }}>ativas: {fogosCount}</span>
            </div>
            <div style={{ ...s.hint, marginBottom: space(3) }}>Ocorrências oficiais da Proteção Civil (~2 min).</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space(2), marginBottom: space(2) }}>
              <button onClick={loadActiveFogos} disabled={fogosLoading} style={touch(s.btnSecondary)}>Mostrar</button>
              <button onClick={clearFogos} style={touch(s.btnGhost)}>Limpar</button>
            </div>
            {fogosMessage && <div style={dyn.note('info')}>{fogosMessage}</div>}
          </div>

          {/* 2. HISTORICAL PERIMETERS — primary */}
          <div style={s.sectionLabel}>Áreas ardidas</div>
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(1) }}>
              <div style={s.cardTitle}>ICNF (oficial)</div>
              <span style={{ fontSize: '0.7rem', color: color.textFaint }}>polígonos: {icnfCount}</span>
            </div>
            <div style={{ ...s.hint, marginBottom: space(3) }}>
              Perímetros validados em campo (1975-2025). Atualização anual.
            </div>
            <div style={{ marginBottom: space(2) }}>
              <label style={s.label}>Ano</label>
              <select value={icnfYear} onChange={(e) => setIcnfYear(e.target.value)} style={s.select}>
                {icnfYears.length === 0 && <option value={icnfYear}>{icnfYear}</option>}
                {icnfYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space(2), marginBottom: space(2) }}>
              <button onClick={loadIcnf} disabled={icnfLoading} style={touch(s.btnSecondary)}>Mostrar</button>
              <button onClick={clearIcnf} style={touch(s.btnGhost)}>Limpar</button>
            </div>
            {icnfMessage && <div style={dyn.note(icnfMessageTone)}>{icnfMessage}</div>}
          </div>

          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(1) }}>
              <div style={s.cardTitle}>Perímetro recente (dNBR)</div>
              <span style={{ fontSize: '0.7rem', color: color.textFaint }}>polígonos: {recentPerimeterCount}</span>
            </div>
            <div style={{ ...s.hint, marginBottom: space(3) }}>
              Usa a geometria selecionada num ponto de fogo ou numa área desenhada para derivar um perímetro aproximado com Sentinel-2.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space(2), marginBottom: space(2) }}>
              <button
                onClick={deriveRecentPerimeter}
                disabled={recentPerimeterLoading || !selectedGeometry || !fireDate}
                style={touch(s.btnSecondary)}
              >
                Derivar
              </button>
              <button onClick={clearRecentPerimeter} style={touch(s.btnGhost)}>Limpar</button>
            </div>
            {recentPerimeterMessage && <div style={dyn.note(recentPerimeterTone)}>{recentPerimeterMessage}</div>}
          </div>

          {/* 3. ANALYSIS — primary workflow */}
          <div style={s.sectionLabel}>Análise</div>
          <div style={s.cardAnalyst}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: space(3) }}>
              <div style={s.cardTitle}>Configuração</div>
              {hasResults && (
                <button onClick={() => setResultsOpen((o) => !o)} style={{ ...s.btnGhost, fontSize: '0.72rem' }}>
                  {resultsOpen ? 'Fechar resultados' : 'Ver resultados'}
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space(2), marginBottom: space(3) }}>
              <div>
                <label style={s.label}>Satélite</label>
                <select value={selectedSatellite} onChange={(e) => setSelectedSatellite(e.target.value)} style={s.select}>
                  <option value="">—</option>
                  {satellites.map((sat) => <option key={sat} value={sat}>{sat}</option>)}
                </select>
              </div>
              <div>
                <label style={s.label}>Índice</label>
                <select value={selectedIndex} onChange={(e) => setSelectedIndex(e.target.value)} style={s.select}>
                  <option value="">—</option>
                  {indices.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>

            <div style={s.sectionLabel}>Série temporal</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space(2), marginBottom: space(3) }}>
              <div>
                <label style={s.label}>Início</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={s.input} />
              </div>
              <div>
                <label style={s.label}>Fim</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={s.input} />
              </div>
            </div>

            <div style={s.sectionLabel}>Severidade</div>
            <div style={{ marginBottom: space(2) }}>
              <label style={s.label}>Data do incêndio</label>
              <input type="date" value={fireDate} onChange={(e) => setFireDate(e.target.value)} style={s.input} />
            </div>

            <FireAnalyst
              geometry={selectedGeometry}
              fireDate={fireDate}
              satellite={selectedSatellite}
              index={selectedIndex}
              startDate={startDate}
              endDate={endDate}
              windowSize={windowSize}
              onWindowSizeChange={setWindowSize}
              onTimeSeriesReady={handleTimeSeriesReady}
              onSeverityReady={handleSeverityReady}
              onBusyChange={setAnalysisBusy}
            />

            {!selectedGeometry && (
              <div style={{ ...dyn.note('warn'), marginTop: space(3) }}>
                Desenha uma área no mapa (polígono ou retângulo) para ativar a análise.
              </div>
            )}
          </div>

          {/* 4. AUXILIARY LAYERS — demoted */}
          <div style={s.sectionLabel}>Camadas auxiliares</div>
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(1) }}>
              <div style={s.cardTitle}>MODIS MCD64A1</div>
              <span style={{ fontSize: '0.7rem', color: color.textFaint }}>áreas: {baCount}</span>
            </div>
            <div style={{ ...s.hint, marginBottom: space(3) }}>
              Perímetros mensais (~1-2 meses de atraso). {baCoverage && <>Até <strong>{baCoverage.latest}</strong>.</>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space(2), marginBottom: space(2) }}>
              <div>
                <label style={s.label}>De</label>
                <input type="date" value={baFrom} onChange={(e) => setBaFrom(e.target.value)} style={s.input} />
              </div>
              <div>
                <label style={s.label}>Até</label>
                <input type="date" value={baTo} onChange={(e) => setBaTo(e.target.value)} style={s.input} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space(2), marginBottom: space(2) }}>
              <button onClick={loadModisBurned} disabled={baLoading || !geeConfigured} style={touch(s.btnSecondary)}>Mostrar</button>
              <button onClick={clearBurnedAreas} style={touch(s.btnGhost)}>Limpar</button>
            </div>
            {baMessage && <div style={dyn.note(baMessageTone)}>{baMessage}</div>}
          </div>

          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(1) }}>
              <div style={s.cardTitle}>NASA FIRMS</div>
              <span style={{ fontSize: '0.7rem', color: color.textFaint }}>hotspots: {liveHotspotsCount}</span>
            </div>
            <div style={{ ...s.hint, marginBottom: space(3) }}>Deteções térmicas VIIRS (~3 h). Complementar à ANEPC.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space(2), marginBottom: space(2) }}>
              <button onClick={loadLiveHotspots} disabled={firmsLoading || !firmsConfigured} style={touch(s.btnSecondary)}>Mostrar</button>
              <button onClick={clearLiveHotspots} style={touch(s.btnGhost)}>Limpar</button>
            </div>
            {firmsMessage && <div style={dyn.note(firmsConfigured ? 'info' : 'warn')}>{firmsMessage}</div>}
          </div>

          {geeMessage && <div style={dyn.note(geeConfigured ? 'info' : 'warn')}>{geeMessage}</div>}
        </aside>

        <main style={s.main}>
          <div style={s.mapWrap}>
            <Map ref={mapComponentRef} />
          </div>

          {hasResults && !resultsOpen && (
            <button onClick={() => setResultsOpen(true)} style={s.panelToggle}>
              <span style={s.panelToggleDot} />
              Resultados da análise
            </button>
          )}

          <ResultsPanel
            open={resultsOpen}
            onClose={() => setResultsOpen(false)}
            timeSeries={timeSeries}
            severity={severity}
            index={selectedIndex}
            satellite={selectedSatellite}
            geometryLabel={geometryLabel}
            busy={analysisBusy}
          />
        </main>
      </div>

      <ChatWidget />
    </div>
  );
}

export default Home;
