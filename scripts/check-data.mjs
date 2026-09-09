import { readFile } from "node:fs/promises";

const seed = JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8"));
const registry = JSON.parse(await readFile(new URL("../data/universities.json", import.meta.url), "utf8"));
const details = JSON.parse(await readFile(new URL("../data/details.json", import.meta.url), "utf8"));
const exams = JSON.parse(await readFile(new URL("../data/exams.json", import.meta.url), "utf8"));
const coverage = JSON.parse(await readFile(new URL("../data/coverage.json", import.meta.url), "utf8"));
const examIds = new Set();
for (const exam of exams) {
  if (examIds.has(exam.id)) throw new Error(`Duplicate exam: ${exam.id}`);
  examIds.add(exam.id);
  if (!registry.universities.some(u => u.id === exam.universityId)) throw new Error(`Unknown exam university: ${exam.universityId}`);
  if (!(Number.isInteger(exam.academicYear) || (exam.academicYear === null && exam.resourceType === 'archive')) || !exam.title || !/^https:\/\//.test(exam.sourceUrl)) throw new Error(`Invalid exam metadata: ${exam.id}`);
  if (exam.documentUrl && !/^https:\/\//.test(exam.documentUrl)) throw new Error(`Invalid exam document: ${exam.id}`);
}
if (coverage.universities.length !== registry.universities.length) throw new Error('Coverage must account for every registry university');
const coverageIds = new Set(coverage.universities.map(u => u.universityId));
if (coverageIds.size !== registry.universities.length || registry.universities.some(u => !coverageIds.has(u.id))) throw new Error('Coverage university mismatch');
const detailIds = new Set();
for (const detail of details) {
  if (detailIds.has(detail.universityId)) throw new Error(`Duplicate detail: ${detail.universityId}`);
  detailIds.add(detail.universityId);
  if (!registry.universities.some(item => item.id === detail.universityId)) throw new Error(`Unknown detail university: ${detail.universityId}`);
  if (!detail.overview || !detail.admissions?.length || !detail.sources?.length) throw new Error(`Incomplete detail: ${detail.universityId}`);
  for (const source of detail.sources) {
    if (!/^https?:\/\//.test(source.url)) throw new Error(`Invalid detail source: ${source.url}`);
  }
}
const ids = new Set();
const sourceKeys = new Set(seed.sources.map((source) => source.key));
const allowedRules = new Set([
  "HY_TOP3_7", "HY_MED_TOP3_4", "NO_CSAT_MIN", "SKKU_TOP3_6", "SKKU_TOP3_5",
  "SKKU_TOP3_6_MATH", "SKKU_TOP3_5_MATH", "SKKU_ALL4_5", "SOGANG_TOP3_7_H4",
  "REFERENCE_ONLY"
]);

for (const item of seed.programs) {
  if (ids.has(item.id)) throw new Error(`Duplicate program id: ${item.id}`);
  ids.add(item.id);
  if (!sourceKeys.has(item.sourceKey)) throw new Error(`Unknown source: ${item.sourceKey}`);
  if (!allowedRules.has(item.ruleCode)) throw new Error(`Unknown rule: ${item.ruleCode}`);
  if (item.calculationReady && item.ruleCode === "REFERENCE_ONLY") {
    throw new Error(`Calculation-ready record has no rule: ${item.id}`);
  }
  if (!item.sourcePages || item.verificationStatus !== "verified") {
    throw new Error(`Unverified record: ${item.id}`);
  }
}

const essayTotals = Object.fromEntries(
  ["한양대학교", "연세대학교", "성균관대학교", "서강대학교"].map((university) => [
    university,
    seed.programs
      .filter((item) => item.university === university && item.track === "논술")
      .reduce((sum, item) => sum + (item.seats || 0), 0)
  ])
);

const expectedEssayTotals = {
  "한양대학교": 233,
  "연세대학교": 288,
  "성균관대학교": 376,
  "서강대학교": 171
};

for (const [university, expected] of Object.entries(expectedEssayTotals)) {
  if (essayTotals[university] !== expected) {
    throw new Error(`${university} 논술 모집인원 합계 불일치: ${essayTotals[university]} / ${expected}`);
  }
}

const universityIds = new Set();
for (const item of registry.universities) {
  if (universityIds.has(item.id)) throw new Error(`Duplicate university id: ${item.id}`);
  universityIds.add(item.id);
  if (!item.name || !item.campus || !item.region || !item.officialInfoUrl) {
    throw new Error(`Incomplete university registry record: ${item.id}`);
  }
  if (!["일반대학", "전문대학"].includes(item.institutionType)) {
    throw new Error(`Unknown institution type: ${item.id}`);
  }
}

const generalCount = registry.universities.filter((item) => item.institutionType === "일반대학").length;
const collegeCount = registry.universities.filter((item) => item.institutionType === "전문대학").length;
if (generalCount !== 220 || collegeCount !== 132) {
  throw new Error(`University registry count mismatch: general=${generalCount}, college=${collegeCount}`);
}

console.log(JSON.stringify({
  academicYear: seed.metadata.academicYear,
  universities: registry.universities.length,
  generalUniversities: generalCount,
  colleges: collegeCount,
  sources: seed.sources.length,
  programs: seed.programs.length,
  calculationReady: seed.programs.filter((item) => item.calculationReady).length,
  essayTotals
}));
