import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useInstall, useOnline } from '../lib/pwa';
import { useState } from 'react';

const tabs: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Скан', icon: 'camera', end: true },
  { to: '/database', label: 'База', icon: 'flask' },
  { to: '/compare', label: 'Салыстыру', icon: 'scale' },
  { to: '/history', label: 'Тарих', icon: 'clock' },
  { to: '/more', label: 'Тағы', icon: 'info' },
];

function InstallBanner() {
  const { canInstall, install, showIosHint } = useInstall();
  const [hidden, setHidden] = useState(() => sessionStorage.getItem('bc.installHidden') === '1');
  if (hidden || (!canInstall && !showIosHint)) return null;
  const hide = () => {
    sessionStorage.setItem('bc.installHidden', '1');
    setHidden(true);
  };
  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-violet px-4 py-3 text-white shadow-card animate-fadeup">
      <Icon name="download" className="mt-0.5 shrink-0" />
      <div className="flex-1 text-sm">
        {canInstall ? (
          <>
            <p className="font-semibold">Қосымшаны телефонға орнатыңыз</p>
            <button onClick={install} className="mt-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-violet-dark">
              Орнату
            </button>
          </>
        ) : (
          <>
            <p className="font-semibold">iPhone-ға орнату</p>
            <p className="text-white/90">Safari-де «Бөлісу» батырмасын басып, «Басты экранға қосу» таңдаңыз.</p>
          </>
        )}
      </div>
      <button onClick={hide} aria-label="Жабу" className="p-1 text-white/80">
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}

export function Layout() {
  const online = useOnline();
  const { pathname } = useLocation();
  const isRoot = pathname === '/';
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col bg-cream">
      <header className="safe-top sticky top-0 z-30 bg-cream/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/icons/favicon-32.png" alt="" width={28} height={28} className="rounded-lg" />
            <span className="text-lg font-extrabold tracking-tight">
              Beauty<span className="text-violet">Chem</span> AI
            </span>
          </div>
          {!online && <span className="chip bg-amber-100 text-amber-800">Офлайн</span>}
        </div>
        {!online && (
          <p className="bg-amber-50 px-4 py-2 text-xs text-amber-800">
            Интернет жоқ. Химиялық база мен тарих қолжетімді (бұрын ашылғандар), ал AI талдауы үшін желі қажет.
          </p>
        )}
      </header>
      {isRoot && <InstallBanner />}
      <main className="flex-1 px-4 pb-32 pt-3">
        <Outlet />
      </main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-xl rounded-t-3xl bg-white shadow-nav" aria-label="Негізгі навигация">
        <ul className="grid grid-cols-5 px-2 pt-2">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] font-semibold transition ${isActive ? 'text-violet' : 'text-ink-faint'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`rounded-full px-4 py-1 transition ${isActive ? 'bg-violet-soft' : ''}`}>
                      <Icon name={t.icon} />
                    </span>
                    {t.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
