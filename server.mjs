import express from "express";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {installDocumentRoutes} from './document-service.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(await readFile(path.join(__dirname, "data", "seed.json"), "utf8"));
const universityRegistry = JSON.parse(await readFile(path.join(__dirname, "data", "universities.json"), "utf8"));
const supplementalRegistry=JSON.parse(await readFile(path.join(__dirname,'data/supplemental-universities.json'),'utf8'));
const details = JSON.parse(await readFile(path.join(__dirname, "data", "details.json"), "utf8"));
const exams = JSON.parse(await readFile(path.join(__dirname, "data", "exams.json"), "utf8"));
const coverage = JSON.parse(await readFile(path.join(__dirname, "data", "coverage.json"), "utf8"));
let outcomes;
try { outcomes = JSON.parse(await readFile(path.join(__dirname, "data", "outcomes.json"), "utf8")); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  outcomes = JSON.parse(gunzipSync(await readFile(path.join(__dirname, "data", "outcomes.json.gz"))).toString("utf8"));
}
const essayUniversities = JSON.parse(await readFile(path.join(__dirname, "data", "essay-universities.json"), "utf8"));
let extraDetails = {universities: []};
try { extraDetails = JSON.parse(await readFile(path.join(__dirname, "data", "extra-details.json"), "utf8")); }
catch(error) { if(error.code !== "ENOENT") throw error; }
const outcomeSchools = [...new Set(outcomes.map(row => row.universityId))].map(id => {
  const rows = outcomes.filter(row => row.universityId === id);
  return { universityId: id, universityName: rows[0].universityName, count: rows.length, years: [...new Set(rows.map(row => row.academicYear))].sort() };
});
const app = express();
const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json({ limit: "250kb" }));
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: 0,
  etag: true
}));
app.use('/vendor/pdfjs',express.static(path.join(__dirname,'node_modules/pdfjs-dist/build'),{maxAge:'1d'}));
for(const part of ['cmaps','standard_fonts','wasm','iccs'])app.use('/vendor/pdfjs/'+part,express.static(path.join(__dirname,'node_modules/pdfjs-dist',part),{maxAge:'1d'}));
const practiceBank=JSON.parse(await readFile(path.join(__dirname,'data/practice-questions.json'),'utf8'));
const officialQuestionBank=JSON.parse(await readFile(path.join(__dirname,'data/official-question-bank.json'),'utf8'));
installDocumentRoutes(app,[...exams.filter(p=>p.documentUrl&&p.linkCheck?.isPdf).map(p=>({id:p.id,url:p.documentUrl,title:p.title})),...(practiceBank.resources||[]),...(officialQuestionBank.resources||[])]);

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
  const base=(!pool||storageMode!=='postgresql')?universityRegistry.universities:(await pool.query('SELECT * FROM universities ORDER BY name, campus')).rows.map(mapUniversity);
  return [...base,...(supplementalRegistry.universities||[]).filter(u=>!base.some(b=>b.id===u.id))];
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
      detailUniversities: details.length,
      outcomeRecords: outcomes.length,
      outcomeUniversities: outcomeSchools.length,
      essayUniversities: essayUniversities.universities.length,
      examResources: exams.length,
      release: process.env.RENDER_GIT_COMMIT || "local",
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
    response.set("Cache-Control", "no-cache");
    response.json({ metadata: { ...seed.metadata, registry: {...universityRegistry.metadata,totalWithSupplements:universities.length,supplementalCount:supplementalRegistry.universities.length} }, sources, programs, universities, details, exams, coverage, outcomeSchools, essayUniversities, storage: storageMode });
  } catch (error) {
    response.status(500).json({ error: "catalog_unavailable" });
  }
});

app.get("/api/report", async (_request, response) => {
  response.status(405).json({ error: "client_generated_report_only" });
});

// Expose only the reviewed public practice datasets, never arbitrary server files.
for (const filename of ['essay-rubrics.json', 'practice-questions.json', 'interviews.json', 'essay-standards.json', 'education-registry.json', 'essay-universities.json', 'official-question-bank.json', 'authored-question-bank.json']) {
  app.get('/data/' + filename, (_request, response) => {
    response.sendFile(path.join(__dirname, 'data', filename), error => {
      if (error && !response.headersSent) response.status(503).json({error:'practice_data_unavailable'});
    });
  });
}
app.get('/api/exams', (_request, response) => response.json(exams));
app.get('/api/integrations',(_request,response)=>{
  const url=process.env.RESUME_WRITER_URL||'https://jobnkill-essay-platform.jungdaewoong.chatgpt.site';
  response.json({resumeWriter:{url:/^https:\/\//.test(url)?url:null,label:'잡앤킬 자기소개서 작성'}});
});

function outcomeCandidateGroups(scale, formulaKey) {
  const grouped = new Map();
  for (const row of outcomes) {
    if (String(row.scale) !== String(scale) || String(row.formulaKey || '') !== String(formulaKey || '')) continue;
    const key = [row.universityId, row.program, row.track, row.metric, row.scale, row.formulaKey].join('|');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return [...grouped.values()].map(rows => rows.sort((a, b) => Number(a.academicYear) - Number(b.academicYear)));
}

function availableOutcomeFormulas(scale) {
  const formulas = new Map();
  for (const rows of outcomeCandidateGroups(scale, null)) {
    // This branch is intentionally unreachable because a formula is required below.
  }
  for (const row of outcomes) {
    if (String(row.scale) !== String(scale) || !row.formulaKey || !row.formulaLabel) continue;
    const item = formulas.get(row.formulaKey) || { key: row.formulaKey, label: row.formulaLabel, series: 0 };
    formulas.set(row.formulaKey, item);
  }
  for (const item of formulas.values()) {
    item.series = outcomeCandidateGroups(scale, item.key).filter(rows => {
      const latest = Math.max(...rows.map(row => Number(row.academicYear)));
      const recent = rows.filter(row => Number(row.academicYear) >= latest - 4);
      const years = new Set(recent.map(row => Number(row.academicYear)));
      return years.size >= 3 && years.size === recent.length && recent.every(row => Number.isFinite(row.grade70) && row.grade70 >= 1 && row.grade70 <= Number(scale));
    }).length;
  }
  return [...formulas.values()].filter(item => item.series > 0).sort((a, b) => b.series - a.series || a.label.localeCompare(b.label, 'ko'));
}

function rankOutcomeCandidates({ grade, scale, formulaKey, limit = 3 }) {
  const candidates = [];
  for (const rows of outcomeCandidateGroups(scale, formulaKey)) {
    const latest = Math.max(...rows.map(row => Number(row.academicYear)));
    const recent = rows.filter(row => Number(row.academicYear) >= latest - 4);
    const years = new Set(recent.map(row => Number(row.academicYear)));
    const sameSeries = years.size >= 3 && years.size === recent.length && recent.every(row => (
      Number.isFinite(row.grade70) && row.grade70 >= 1 && row.grade70 <= Number(scale) &&
      String(row.scale) === String(scale) && String(row.formulaKey) === String(formulaKey) &&
      row.metric === recent[0].metric
    ));
    if (!sameSeries) continue;
    const cutoffs = recent.map(row => Number(row.grade70)).sort((a, b) => a - b);
    const min = cutoffs[0], max = cutoffs[cutoffs.length - 1], middle = cutoffs[Math.floor(cutoffs.length / 2)];
    const rangeDistance = grade < min ? min - grade : grade > max ? grade - max : 0;
    const relation = grade < min ? '입력한 환산등급이 과거 70% 기준 범위보다 낮습니다.' :
      grade > max ? '입력한 환산등급이 과거 70% 기준 범위보다 높습니다.' :
      '입력한 환산등급이 과거 70% 기준 범위 안에 있습니다.';
    const first = recent[0];
    candidates.push({
      universityId: first.universityId,
      universityName: first.universityName,
      program: first.program,
      track: first.track,
      formulaLabel: first.formulaLabel,
      metric: first.metric,
      scale: String(scale),
      years: recent.map(row => Number(row.academicYear)),
      grade70Range: { min, max },
      referenceMedian: middle,
      studentGrade: grade,
      differenceFromMedian: Math.round((grade - middle) * 100) / 100,
      rangeDistance: Math.round(rangeDistance * 100) / 100,
      relation,
      sourceUrls: [...new Set(recent.map(row => row.sourceUrl).filter(url => /^https:\/\//.test(url)))],
      dataYears: recent.length
    });
  }
  return candidates.sort((a, b) =>
    a.rangeDistance - b.rangeDistance ||
    Math.abs(a.differenceFromMedian) - Math.abs(b.differenceFromMedian) ||
    b.dataYears - a.dataYears ||
    a.universityName.localeCompare(b.universityName, 'ko') ||
    a.program.localeCompare(b.program, 'ko')
  ).slice(0, Math.max(1, Math.min(3, Number(limit) || 3)));
}

app.get('/api/outcome-candidates', (request, response) => {
  const scale = String(request.query.scale || '');
  if (!['5', '9'].includes(scale)) return response.status(400).json({ error: 'grade_scale_required' });
  const formulas = availableOutcomeFormulas(scale);
  const formulaKey = String(request.query.formulaKey || '');
  const rawGrade = String(request.query.grade || '').trim();
  if (!formulaKey || rawGrade === '') return response.json({
    formulas,
    candidates: [],
    message: '대학별 산식으로 계산한 환산등급과 비교 산식을 선택하면, 동일 산식·동일 전형의 최근 3~5개년 입결을 기준으로 후보 순위를 계산합니다.'
  });
  const grade = Number(rawGrade);
  if (!Number.isFinite(grade) || grade < 1 || grade > Number(scale)) return response.status(400).json({ error: 'converted_grade_invalid' });
  if (!formulas.some(item => item.key === formulaKey)) return response.status(400).json({ error: 'formula_key_invalid' });
  const candidates = rankOutcomeCandidates({ grade, scale, formulaKey });
  response.set('Cache-Control', 'public, max-age=300');
  response.json({
    formulas,
    candidates,
    message: candidates.length
      ? '순위는 동일 산식·동일 등급체계·최근 3~5개년 공식 70% 기준 범위와 입력한 환산등급의 거리로 정렬한 성적 비교 후보입니다. 합격 예측이나 합격 보장이 아닙니다.'
      : '현재 수집된 자료에서는 입력한 산식·등급체계로 최근 3개년 이상 동일 비교 조건을 충족한 후보를 찾지 못했습니다.'
  });
});

app.get("/api/outcomes", (request, response) => {
  const id = String(request.query.universityId || "");
  if((supplementalRegistry.universities||[]).some(u=>u.id===id))return response.json([]);
  if (!/^\d{7}$/.test(id)) return response.status(400).json({ error: "university_id_required" });
  response.set("Cache-Control", "public, max-age=300");
  response.json(outcomes.filter(row => row.universityId === id));
});

app.get("/api/departments", (request, response) => {
  const universityId = String(request.query.universityId || "");
  if (universityId) {
    if((supplementalRegistry.universities||[]).some(u=>u.id===universityId))return response.json(null);
    if (!/^\d{7}$/.test(universityId)) return response.status(400).json({error:"university_id_invalid"});
    return response.json(extraDetails.universities.find(u=>u.universityId===universityId)||null);
  }
  const query = String(request.query.query||"").trim().slice(0,100);
  const offset = Math.max(0,parseInt(request.query.offset,10)||0);
  const matches=[];
  for (const university of extraDetails.universities) {
    if (["0000431", "0002659", "0000548"].includes(university.universityId)) continue;
    const school=universityRegistry.universities.find(u=>u.id===university.universityId);
    for (const department of university.departmentCatalog?.items||[]) {
      if (!query || [department.name,department.category,school?.name].some(v=>String(v||"").includes(query))) {
        matches.push({...department,universityId:university.universityId,universityName:school?.displayName||school?.name,academicYear:university.departmentCatalog.academicYear,sourceUrl:department.officialInfoUrl||university.departmentCatalog.sourceUrl});
      }
    }
  }
  response.json({total:matches.length,offset,items:matches.slice(offset,offset+50),nextOffset:offset+50<matches.length?offset+50:null});
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
