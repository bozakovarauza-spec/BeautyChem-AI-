import { useEffect, useState } from 'react';
import { api } from '../api';
import type { HealthInfo } from '../types';
import { useInstall } from '../lib/pwa';
import { Icon } from '../components/Icon';

type Tab = 'about' | 'guide';

export default function MorePage() {
  const [tab, setTab] = useState<Tab>('about');
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const { canInstall, install, installed, showIosHint } = useInstall();

  useEffect(() => {
    api.health().then(setHealth).catch(() => undefined);
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 rounded-2xl bg-lavender p-1">
        {(['about', 'guide'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-xl py-2.5 text-sm font-bold transition ${tab === t ? 'bg-white text-violet-dark shadow-card' : 'text-ink-soft'}`}>
            {t === 'about' ? 'Жоба туралы' : 'Нұсқаулық'}
          </button>
        ))}
      </div>

      {tab === 'about' && (
        <div className="space-y-4 animate-fadeup">
          <section className="card">
            <h1 className="text-2xl font-extrabold">Beauty<span className="text-violet">Chem</span> AI</h1>
            <p className="mt-2 text-[15px]">Косметикалық өнімдерді камера арқылы немесе сурет жүктеу арқылы анықтайтын, нақты INCI құрамын тауып, әр ингредиентті жеке химиялық базамен сәйкестендіріп талдайтын ғылыми қосымша.</p>
          </section>
          <section className="card">
            <h2 className="h2 mb-2">Ғылыми жоба</h2>
            <p className="text-[15px]"><span className="font-semibold">Тақырыбы:</span> «Косметикалық өнімдер құрамындағы химиялық қоспалардың адам терісіне әсерін зерттеу»</p>
            <p className="mt-2 text-[15px]"><span className="font-semibold">Авторы:</span> Кенесова Амина, 9-сынып оқушысы</p>
            <p className="text-[15px]"><span className="font-semibold">Жетекшісі:</span> Бозақова Рауза</p>
          </section>
          <section className="card">
            <h2 className="h2 mb-2">Қолданылатын технологиялар</h2>
            <div className="flex flex-wrap gap-1.5">
              {['React + TypeScript', 'Vite', 'Tailwind CSS', 'Node.js + Express', 'SQLite', 'Gemini Vision API', 'PubChem (3D)', 'PWA'].map((t) => <span key={t} className="chip-violet">{t}</span>)}
            </div>
          </section>
          <section className="card">
            <h2 className="h2 mb-2">Жүйе күйі</h2>
            <ul className="space-y-1.5 text-sm">
              <li>Сервер: {health ? <b className="text-emerald-600">қосулы</b> : <b className="text-red-700">қолжетімсіз</b>}</li>
              <li>Химиялық база: {health ? `${health.ingredientCount} ингредиент` : '—'}</li>
              <li>Gemini AI: {health ? (health.geminiConfigured ? <b className="text-emerald-600">бапталған ({health.model})</b> : <b className="text-amber-700">API кілті жоқ (.env)</b>) : '—'}</li>
              <li>Орнатылу: {installed ? <b className="text-emerald-600">қосымша ретінде орнатылған</b> : 'браузерде ашылған'}</li>
            </ul>
            {canInstall && <button onClick={install} className="btn-primary mt-3 w-full"><Icon name="download" size={18} /> Телефонға орнату</button>}
            {showIosHint && <p className="mt-3 rounded-xl bg-lavender p-3 text-sm">iPhone: Safari-де <b>Бөлісу</b> → <b>Басты экранға қосу</b>.</p>}
          </section>
          <section className="card">
            <h2 className="h2 mb-2">Маңызды ескерту</h2>
            <p className="text-sm text-ink-soft">Қосымша оқу-ғылыми мақсатта жасалған. Ол медициналық диагноз қоймайды және дәрігер кеңесін алмастырмайды. Өнім формуласы елге және шығарылған уақытқа байланысты өзгеруі мүмкін, сондықтан құрамды әрдайым қаптамамен салыстырыңыз. AI жауаптары қате болуы мүмкін: нәтижені тексеріңіз.</p>
          </section>
        </div>
      )}

      {tab === 'guide' && (
        <div className="space-y-3 animate-fadeup">
          {[
            ['1. Өнімді сканерлеу', '«Скан» бетінде «Камерамен түсіру» немесе «Галереядан жүктеу» таңдаңыз. Бренд пен атауы анық көрінсін, жарық жеткілікті болсын. Қолдау көрсетілетін форматтар: JPG, JPEG, PNG, WEBP.'],
            ['2. Анықталған өнімді тексеру', 'AI бренд, атау, түр, көлем және SPF анықтайды. Сенімділік төмен болса, мәліметті өзіңіз түзетіңіз немесе ықтимал нұсқалардан таңдаңыз.'],
            ['3. Құрамды алу', 'Қосымша алдымен жергілікті өнімдер базасын, содан кейін ресми сайт пен сенімді каталогтарды іздейді. Табылмаса, құрам жазылған жағын түсіріңіз: OCR мәтінді оқиды, сіз оны тексеріп түзетесіз.'],
            ['4. Талдау нәтижесі', 'Әр ингредиент химиялық базадан ізделеді: формуласы, қасиеттері, қызметі, терідегі әсері және дереккөздері көрсетіледі. Базада жоқ заттар «Химиялық базаға енгізілмеген» деп белгіленеді, оларды өзіңіз қоса аласыз.'],
            ['5. Химиялық база', '«База» бөлімінде іздеу, сүзгі, 3D молекула және ингредиент карточкалары бар. «Қосу» батырмасымен жаңа зат енгізуге болады.'],
            ['6. Салыстыру және тарих', 'Талдаулар «Тарих» бөлімінде сақталады. «Салыстыру» бөлімінде 2–3 өнімнің құрамын қатар қарауға болады.'],
            ['7. Офлайн режим', 'Интернет жоқ болса, бұрын ашылған химиялық база және тарих көрінеді. AI тану мен интернеттен құрам іздеу үшін желі қажет.'],
          ].map(([t, d]) => (
            <section key={t} className="card">
              <h2 className="h2">{t}</h2>
              <p className="mt-1 text-[15px] text-ink-soft">{d}</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
