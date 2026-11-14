import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { parseSdf, type Molecule } from '../lib/sdf';

const COLORS: Record<string, string> = {
  H: '#ECE7F7', C: '#6E6587', N: '#4F7CF5', O: '#EF5B5B', S: '#E8B923', P: '#F59E0B', Cl: '#34B36B',
  F: '#7BD389', Br: '#A5532B', Si: '#D1A375', Mg: '#3FBF6F', Ti: '#9AA0B5', Zn: '#7B8DB8', Na: '#8B5CF6',
};
const RADII: Record<string, number> = { H: 0.26, C: 0.42, N: 0.4, O: 0.39, S: 0.5, P: 0.5, Cl: 0.5, Si: 0.5, Mg: 0.55 };

interface Props {
  /** PubChem-тен іздейтін зат атауы. null болса құрылым жоқ деп көрсетіледі. */
  query: string | null;
  height?: number;
  noStructureText?: string;
}

/** Нақты 3D молекула (PubChem SDF), canvas арқылы айналады, саусақпен бұруға болады. */
export function MoleculeViewer({ query, height = 280, noStructureText }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mol, setMol] = useState<Molecule | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'error'>(query ? 'loading' : 'none');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (!query) {
      setState('none');
      return;
    }
    let cancelled = false;
    setState('loading');
    api
      .molecule(query)
      .then((sdf) => {
        if (cancelled) return;
        setMol(parseSdf(sdf));
        setState('ready');
      })
      .catch((e: { status?: number; message?: string }) => {
        if (cancelled) return;
        if (e.status === 404) setState('none');
        else {
          setErrMsg(e.message || 'Құрылымды жүктеу мүмкін болмады.');
          setState('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mol || state !== 'ready') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const n = mol.atoms.length;
    const cx = mol.atoms.reduce((s, a) => s + a.x, 0) / n;
    const cy = mol.atoms.reduce((s, a) => s + a.y, 0) / n;
    const cz = mol.atoms.reduce((s, a) => s + a.z, 0) / n;
    const pts = mol.atoms.map((a) => ({ x: a.x - cx, y: a.y - cy, z: a.z - cz, el: a.el }));
    const maxR = Math.max(1, ...pts.map((p) => Math.hypot(p.x, p.y, p.z)));

    let ax = 0.35;
    let ay = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let raf = 0;
    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const sx = Math.sin(ax), cxr = Math.cos(ax), sy = Math.sin(ay), cyr = Math.cos(ay);
      const scale = (Math.min(w, h) * 0.42) / maxR;
      const dist = maxR * 4;
      const P = pts.map((p) => {
        // Y осі, содан кейін X осі бойынша айналдыру
        const x1 = p.x * cyr + p.z * sy;
        const z1 = -p.x * sy + p.z * cyr;
        const y2 = p.y * cxr - z1 * sx;
        const z2 = p.y * sx + z1 * cxr;
        const f = dist / (dist - z2);
        return { X: w / 2 + x1 * scale * f, Y: h / 2 - y2 * scale * f, z: z2, f, el: p.el };
      });

      // Байланыстар
      ctx.lineCap = 'round';
      const bondOrder = [...mol.bonds].sort((a, b) => P[a.a].z + P[a.b].z - (P[b.a].z + P[b.b].z));
      for (const b of bondOrder) {
        const A = P[b.a];
        const B = P[b.b];
        const dx = B.X - A.X;
        const dy = B.Y - A.Y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const lw = Math.max(1.5, scale * 0.12 * ((A.f + B.f) / 2));
        const offsets = b.order === 1 ? [0] : b.order === 2 ? [-0.5, 0.5] : [-1, 0, 1];
        ctx.strokeStyle = 'rgba(70, 55, 100, 0.55)';
        ctx.lineWidth = b.order === 1 ? lw : lw * 0.7;
        for (const o of offsets) {
          const off = o * lw * 1.1;
          ctx.beginPath();
          ctx.moveTo(A.X + nx * off, A.Y + ny * off);
          ctx.lineTo(B.X + nx * off, B.Y + ny * off);
          ctx.stroke();
        }
      }

      // Атомдар: алыстан жақынға
      const order = P.map((_, i) => i).sort((a, b) => P[a].z - P[b].z);
      for (const i of order) {
        const a = P[i];
        const r = (RADII[a.el] ?? 0.45) * scale * 0.62 * a.f;
        const col = COLORS[a.el] ?? '#9C8FB8';
        const g = ctx.createRadialGradient(a.X - r * 0.35, a.Y - r * 0.35, r * 0.1, a.X, a.Y, r);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.25, col);
        g.addColorStop(1, shade(col, -0.35));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(a.X, a.Y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const tick = () => {
      if (!dragging && !reduce) ay += 0.008;
      draw();
      raf = requestAnimationFrame(tick);
    };
    tick();

    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      ay += (e.clientX - lastX) * 0.01;
      ax += (e.clientY - lastY) * 0.01;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = () => {
      dragging = false;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }, [mol, state]);

  const elements = mol ? [...new Set(mol.atoms.map((a) => a.el))] : [];

  return (
    <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-lavender via-white to-blush">
      <div style={{ height }} className="relative">
        {state === 'ready' && <canvas ref={canvasRef} className="h-full w-full touch-none" aria-label="3D молекула" />}
        {state === 'loading' && <div className="flex h-full items-center justify-center text-sm text-ink-soft">3D құрылым жүктелуде…</div>}
        {state === 'none' && (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-soft">
            {noStructureText ?? 'Бұл зат үшін дискретті 3D молекулалық құрылым жоқ (бейорганикалық кристалл, полимер немесе PubChem-те 3D деректері жоқ).'}
          </div>
        )}
        {state === 'error' && <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-700">{errMsg}</div>}
      </div>
      {state === 'ready' && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-xs text-ink-soft">
          <span>Бұру үшін саусақпен жылжытыңыз · дереккөз: PubChem</span>
          <span className="flex gap-1">
            {elements.map((el) => (
              <span key={el} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5">
                <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[el] ?? '#9C8FB8' }} />
                {el}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}
