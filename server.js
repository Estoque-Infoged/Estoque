const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

async function ensureDatabase() {
  if (!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS estoque_app_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`INSERT INTO estoque_app_state (id, data) VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING`);
}

app.get('/api/health', async (_req, res) => {
  try {
    if (pool) await pool.query('SELECT 1');
    res.json({ ok: true, database: Boolean(pool) });
  } catch (error) {
    res.status(503).json({ ok: false, error: 'Banco indisponível' });
  }
});

app.get('/api/state', async (_req, res) => {
  try {
    if (!pool) return res.json({ data: {} });
    const result = await pool.query('SELECT data, updated_at FROM estoque_app_state WHERE id = 1');
    res.json(result.rows[0] || { data: {} });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Não foi possível ler os dados.' });
  }
});

app.put('/api/state', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'DATABASE_URL não configurada.' });
    if (!req.body || typeof req.body.data !== 'object' || Array.isArray(req.body.data)) {
      return res.status(400).json({ error: 'O corpo deve conter data como objeto JSON.' });
    }
    const result = await pool.query(
      `INSERT INTO estoque_app_state (id, data, updated_at) VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
       RETURNING updated_at`,
      [JSON.stringify(req.body.data)]
    );
    res.json({ ok: true, updated_at: result.rows[0].updated_at });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Não foi possível salvar os dados.' });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'ESTOQUE.html')));

ensureDatabase()
  .then(() => app.listen(PORT, '0.0.0.0', () => console.log(`Estoque online na porta ${PORT}`)))
  .catch((error) => { console.error('Falha ao iniciar:', error); process.exit(1); });
