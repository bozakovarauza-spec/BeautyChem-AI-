-- BeautyChem AI: SQLite схемасы
-- Бұл файл backend іске қосылған сайын орындалады (IF NOT EXISTS арқасында қауіпсіз).

CREATE TABLE IF NOT EXISTS ingredients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  inci_name     TEXT NOT NULL UNIQUE,          -- INCI атауы
  common_name   TEXT,                          -- жалпы / халықаралық атауы (мысалы Avobenzone)
  name_kk       TEXT NOT NULL,                 -- қазақша атауы
  formula       TEXT NOT NULL,                 -- химиялық формула (жай мәтін: C3H8O3)
  chem_class    TEXT NOT NULL,                 -- химиялық класы
  molar_mass    REAL,                          -- молекулалық масса, г/моль (полимер үшін қайталанатын буын)
  molar_mass_note TEXT,                        -- масса туралы ескерту
  cas           TEXT,                          -- CAS нөмірі
  properties    TEXT NOT NULL,                 -- физикалық-химиялық қасиеттері
  function_kk   TEXT NOT NULL,                 -- косметикадағы қызметі
  categories    TEXT NOT NULL DEFAULT '[]',    -- JSON массив: қызмет тегтері (сүзгі үшін)
  mechanism     TEXT,                          -- терідегі әсер ету механизмі
  benefits      TEXT,                          -- ықтимал пайдалы әсері
  risks         TEXT,                          -- ықтимал жағымсыз әсері
  synonyms      TEXT NOT NULL DEFAULT '[]',    -- JSON массив: балама атаулар (іздеу/сәйкестендіру үшін)
  pubchem_query TEXT,                          -- PubChem 3D құрылымын іздеу атауы
  sources       TEXT NOT NULL DEFAULT '[]',    -- JSON массив: {title,url}
  is_custom     INTEGER NOT NULL DEFAULT 0,    -- 1 = пайдаланушы қосқан
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ingredients_common ON ingredients(common_name);

-- Расталған өнім құрамдары (тек пайдаланушы растаған немесе қолмен енгізілген жазбалар)
CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  brand         TEXT NOT NULL,
  name          TEXT NOT NULL,
  product_type  TEXT,
  volume        TEXT,
  market        TEXT,                          -- ел / нарық (мысалы EU, US, KZ)
  formula_year  TEXT,                          -- шығарылым жылы / партия
  inci_text     TEXT NOT NULL,
  source_url    TEXT,
  source_note   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(brand, name);

-- Талдау тарихы (құрылғы ID бойынша бөлінеді)
CREATE TABLE IF NOT EXISTS history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id     TEXT NOT NULL,
  brand         TEXT,
  product_name  TEXT,
  product_type  TEXT,
  thumb         TEXT,                          -- кішкентай JPEG data URL
  result        TEXT NOT NULL,                 -- толық нәтиже JSON
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_history_device ON history(device_id, id DESC);

-- PubChem-тен алынған 3D құрылымдар кэші (офлайн және жылдамдық үшін)
CREATE TABLE IF NOT EXISTS molecules (
  query         TEXT PRIMARY KEY,
  sdf           TEXT,                          -- NULL = PubChem-те 3D құрылым жоқ
  fetched_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
