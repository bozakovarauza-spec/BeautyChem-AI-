import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

interface Props {
  title: string;
  hint?: string;
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

function explain(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (!window.isSecureContext) return 'Камера тек HTTPS арқылы (немесе localhost-та) жұмыс істейді. Қосымшаны HTTPS мекенжайымен ашыңыз.';
  if (!navigator.mediaDevices?.getUserMedia) return 'Бұл браузер камераға қолжетімділікті қолдамайды. «Галереядан жүктеу» әдісін қолданыңыз.';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Камераға рұқсат берілмеді. Браузер баптауларынан осы сайтқа камераны рұқсат етіңіз.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Камера табылмады. «Галереядан жүктеу» әдісін қолданыңыз.';
    case 'NotReadableError':
      return 'Камераны басқа қосымша қолданып тұр. Оны жауып, қайталаңыз.';
    default:
      return 'Камераны ашу мүмкін болмады. «Галереядан жүктеу» әдісін қолданыңыз.';
  }
}

/** getUserMedia арқылы артқы камераны ашады, нақты уақыттағы бейне көрсетеді, суретке түсіреді. */
export function CameraCapture({ title, hint, onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        let stream: MediaStream;
        try {
          // Артқы камера: facingMode "environment"
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false,
          });
        } catch (e) {
          if ((e as { name?: string }).name === 'OverconstrainedError') {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } else throw e;
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
        }
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(explain(e));
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(b), 'image/jpeg', 0.92);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black animate-fadeup">
      <div className="safe-top flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onCancel} className="flex items-center gap-1 text-sm font-semibold" aria-label="Жабу">
          <Icon name="back" /> Артқа
        </button>
        <span className="text-sm font-semibold">{title}</span>
        <span className="w-14" />
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
        {ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
            <div className="relative h-[62%] w-full max-w-sm rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
              <div className="absolute inset-x-2 h-0.5 animate-scan rounded-full bg-violet shadow-[0_0_12px_3px_rgba(139,92,246,0.9)]" />
            </div>
          </div>
        )}
        {!ready && !error && <div className="absolute inset-0 flex items-center justify-center text-white">Камера ашылуда…</div>}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center text-white">
            <Icon name="alert" size={36} />
            <p className="text-sm">{error}</p>
            <button onClick={onCancel} className="btn-primary">Түсінікті</button>
          </div>
        )}
      </div>

      <div className="safe-bottom bg-black/90 px-6 pb-6 pt-4 text-center text-white">
        {hint && <p className="mb-3 text-xs text-white/80">{hint}</p>}
        <button
          onClick={capture}
          disabled={!ready}
          aria-label="Суретке түсіру"
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 transition active:scale-95 disabled:opacity-40"
        >
          <span className="h-14 w-14 rounded-full bg-white" />
        </button>
      </div>
    </div>
  );
}
