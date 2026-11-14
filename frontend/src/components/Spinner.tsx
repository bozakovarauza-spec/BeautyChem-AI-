export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8" role="status" aria-live="polite">
      <svg className="h-12 w-12 animate-spin text-violet" viewBox="0 0 50 50" fill="none">
        <circle cx="25" cy="25" r="20" stroke="currentColor" strokeOpacity="0.2" strokeWidth="5" />
        <path d="M25 5a20 20 0 0 1 20 20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      </svg>
      {label && <p className="text-center text-sm text-ink-soft">{label}</p>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button className="mt-2 font-semibold underline" onClick={onRetry}>
          Қайталау
        </button>
      )}
    </div>
  );
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="rounded-3xl bg-lavender/60 p-6 text-center">
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 text-sm text-ink-soft">{text}</p>}
    </div>
  );
}
