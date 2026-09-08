import express from "express";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(await readFile(path.join(__dirname, "data", "seed.json"), "utf8"));
const universityRegistry = JSON.parse(await readFile(path.join(__dirname, "data", "universities.json"), "utf8"));
const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json({ limit: "250kb" }));
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  etag: true
}));

let pool = null;
let storageMode = "verified-file";
let databaseError = null;

function nullable(value) {
  return value === undefined ? null : value;
}

async function initializeDatabase() {
  if (!process.env.DATABASE_URL) return;

  const useSsl = !/\.internal(?::|\/)/.test(process.env.DATABASE_URL);
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS universities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        campus TEXT NOT NULL,
        display_name TEXT NOT NULL,
        institution_type TEXT NOT NULL CHECK (institution_type IN ('일반대학', '전문대학')),
        region TEXT NOT NULL,
        admission_capacity INTEGER,
        department_count INTEGER,
        admission_track_count INTEGER,
        early_competition_rate NUMERIC,
        regular_competition_rate NUMERIC,
        academic_year INTEGER NOT NULL,
        registry_status TEXT NOT NULL,
        detail_status TEXT NOT NULL CHECK (detail_status IN ('verified_detail', 'registry_only')),
        official_info_url TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS admissions_sources (
        source_key TEXT PRIMARY KEY,
        university TEXT NOT NULL,
        campus TEXT NOT NULL,
        academic_year INTEGER NOT NULL,
        title TEXT NOT NULL,
        source_url TEXT NOT NULL,
        published_at DATE,
        verified_at DATE NOT NULL,
        pages TEXT,
        verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'review', 'archived')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS admissions_programs (
        id TEXT PRIMARY KEY,
        source_key TEXT NOT NULL REFERENCES admissions_sources(source_key),
        academic_year INTEGER NOT NULL,
        university TEXT NOT NULL,
        campus TEXT NOT NULL,
        track TEXT NOT NULL,
        variant TEXT NOT NULL,
        group_name TEXT NOT NULL,
        seats INTEGER,
        seats_note TEXT,
        selection_method TEXT NOT NULL,
        eligibility TEXT NOT NULL,
        csat_rule TEXT NOT NULL,
        rule_code TEXT NOT NULL,
        exam_date TEXT,
        exam_minutes INTEGER,
        source_pages TEXT,
        verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'review', 'archived')),
        calculation_ready BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT,
        sort_order INTEGER NOT NULL DEFAULT 999,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_programs_year_track ON admissions_programs(academic_year, track)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_programs_university ON admissions_programs(university)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_universities_name ON universities(name)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_universities_type_region ON universities(institution_type, region)");

    for (const item of universityRegistry.universities) {
      await client.query(
        `INSERT INTO universities
          (id, name, campus, display_name, institution_type, region, admission_capacity,
           department_count, admission_track_count, early_competition_rate, regular_competition_rate,
           academic_year, registry_status, detail_status, official_info_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, campus=EXCLUDED.campus, display_name=EXCLUDED.display_name,
          institution_type=EXCLUDED.institution_type, region=EXCLUDED.region,
          admission_capacity=EXCLUDED.admission_capacity, department_count=EXCLUDED.department_count,
          admission_track_count=EXCLUDED.admission_track_count,
          early_competition_rate=EXCLUDED.early_competition_rate,
          regular_competition_rate=EXCLUDED.regular_competition_rate,
          academic_year=EXCLUDED.academic_year, registry_status=EXCLUDED.registry_status,
          detail_status=EXCLUDED.detail_status, official_info_url=EXCLUDED.official_info_url,
          updated_at=NOW()`,
        [item.id, item.name, item.campus, item.displayName, item.institutionType, item.region,
          nullable(item.admissionCapacity), nullable(item.departmentCount), nullable(item.admissionTrackCount),
          nullable(item.earlyCompetitionRate), nullable(item.regularCompetitionRate), item.academicYear,
          item.registryStatus, item.detailStatus, item.officialInfoUrl]
      );
    }

    for (const source of seed.sources) {
      await client.query(
        `INSERT INTO admissions_sources
          (source_key, university, campus, academic_year, title, source_url, published_at, verified_at, pages, verification_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (source_key) DO UPDATE SET
          university=EXCLUDED.university, campus=EXCLUDED.campus, academic_year=EXCLUDED.academic_year,
          title=EXCLUDED.title, source_url=EXCLUDED.source_url, published_at=EXCLUDED.published_at,
          verified_at=EXCLUDED.verified_at, pages=EXCLUDED.pages,
          verification_status=EXCLUDED.verification_status, updated_at=NOW()`,
        [source.key, source.university, source.campus, source.academicYear, source.title,
          source.url, source.publishedAt, source.verifiedAt, source.pages, source.status]
      );
    }

    for (const item of seed.programs) {
      await client.query(
        `INSERT INTO admissions_programs
          (id, source_key, academic_year, university, campus, track, variant, group_name, seats,
           seats_note, selection_method, eligibility, csat_rule, rule_code, exam_date, exam_minutes,
           source_pages, verification_status, calculation_ready, notes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (id) DO UPDATE SET
          source_key=EXCLUDED.source_key, academic_year=EXCLUDED.academic_year,
          university=EXCLUDED.university, campus=EXCLUDED.campus, track=EXCLUDED.track,
          variant=EXCLUDED.variant, group_name=EXCLUDED.group_name, seats=EXCLUDED.seats,
          seats_note=EXCLUDED.seats_note, selection_method=EXCLUDED.selection_method,
          eligibility=EXCLUDED.eligibility, csat_rule=EXCLUDED.csat_rule, rule_code=EXCLUDED.rule_code,
          exam_date=EXCLUDED.exam_date, exam_minutes=EXCLUDED.exam_minutes,
          source_pages=EXCLUDED.source_pages, verification_status=EXCLUDED.verification_status,
          calculation_ready=EXCLUDED.calculation_ready, notes=EXCLUDED.notes,
          sort_order=EXCLUDED.sort_order, updated_at=NOW()`,
        [item.id, item.sourceKey, item.academicYear, item.university, item.campus, item.track,
          item.variant, item.groupName, nullable(item.seats), nullable(item.seatsNote), item.selectionMethod,
          item.eligibility, item.csatRule, item.ruleCode, nullable(item.examDate), nullable(item.examMinutes),
          nullable(item.sourcePages), item.verificationStatus, item.calculationReady, nullable(item.notes),
          item.sortOrder]
      );
    }
    await client.query("COMMIT");
    storageMode = "postgresql";
    databaseError = null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function mapSource(row) {
  return {
    key: row.source_key,
    university: row.university,
    campus: row.campus,
    academicYear: row.academic_year,
    title: row.title,
    url: row.source_url,
    publishedAt: row.published_at,
    verifiedAt: row.verified_at,
    pages: row.pages,
    status: row.verification_status
  };
}

function mapUniversity(row) {
  return {
    id: row.id,
    name: row.name,
    campus: row.campus,
    displayName: row.display_name,
    institutionType: row.institution_type,
    region: row.region,
    admissionCapacity: row.admission_capacity,
    departmentCount: row.department_count,
    admissionTrackCount: row.admission_track_count,
    earlyCompetitionRate: row.early_competition_rate === null ? null : Number(row.early_competition_rate),
    regularCompetitionRate: row.regular_competition_rate === null ? null : Number(row.regular_competition_rate),
    academicYear: row.academic_year,
    registryStatus: row.registry_status,
    detailStatus: row.detail_status,
    officialInfoUrl: row.official_info_url
  };
}

function mapProgram(row) {
  return {
    id: row.id,
    sourceKey: row.source_key,
    academicYear: row.academic_year,
    university: row.university,
    campus: row.campus,
    track: row.track,
    variant: row.variant,
    groupName: row.group_name,
    seats: row.seats,
    seatsNote: row.seats_note,
    selectionMethod: row.selection_method,
    eligibility: row.eligibility,
    csatRule: row.csat_rule,
    ruleCode: row.rule_code,
    examDate: row.exam_date,
    examMinutes: row.exam_minutes,
    sourcePages: row.source_pages,
    verificationStatus: row.verification_status,
    calculationReady: row.calculation_ready,
    notes: row.notes,
    sortOrder: row.sort_order
  };
}

async function getSources() {
  if (!pool || storageMode !== "postgresql") return seed.sources;
  const result = await pool.query("SELECT * FROM admissions_sources ORDER BY university");
  return result.rows.map(mapSource);
}

async function getUniversities() {
  if (!pool || storageMode !== "postgresql") return universityRegistry.universities;
  const result = await pool.query("SELECT * FROM universities ORDER BY name, campus");
  return result.rows.map(mapUniversity);
}

async function getPrograms() {
  if (!pool || storageMode !== "postgresql") return seed.programs;
  const result = await pool.query("SELECT * FROM admissions_programs ORDER BY sort_order, university, group_name");
  return result.rows.map(mapProgram);
}

app.get("/api/health", async (_request, response) => {
  try {
    const [programs, universities] = await Promise.all([getPrograms(), getUniversities()]);
    response.json({
      ok: true,
      storage: storageMode,
      academicYear: seed.metadata.academicYear,
      universities: universities.length,
      generalUniversities: universities.filter((item) => item.institutionType === "일반대학").length,
      colleges: universities.filter((item) => item.institutionType === "전문대학").length,
      sources: seed.sources.length,
      programs: programs.length,
      calculationReady: programs.filter((item) => item.calculationReady).length,
      verifiedAt: seed.metadata.verifiedAt,
      databaseError
    });
  } catch (error) {
    response.status(500).json({ ok: false, error: "health_check_failed" });
  }
});

app.get("/api/catalog", async (_request, response) => {
  try {
    const [sources, programs, universities] = await Promise.all([getSources(), getPrograms(), getUniversities()]);
    response.set("Cache-Control", "public, max-age=300");
    response.json({ metadata: { ...seed.metadata, registry: universityRegistry.metadata }, sources, programs, universities, storage: storageMode });
  } catch (error) {
    response.status(500).json({ error: "catalog_unavailable" });
  }
});

app.get("/api/report", async (_request, response) => {
  response.status(405).json({ error: "client_generated_report_only" });
});

app.get("*splat", (_request, response) => {
  response.sendFile(path.join(__dirname, "public", "index.html"));
});

initializeDatabase().catch((error) => {
  databaseError = error instanceof Error ? error.message.slice(0, 180) : "database_initialization_failed";
  storageMode = "verified-file";
  pool?.end().catch(() => {});
  pool = null;
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`jobnkill-susi listening on ${port}; storage=${storageMode}`);
});

async function shutdown() {
  server.close(async () => {
    if (pool) await pool.end();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
