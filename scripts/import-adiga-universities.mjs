import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [generalPath, collegePath, outputPath = "data/universities.json"] = process.argv.slice(2);

if (!generalPath || !collegePath) {
  console.error("usage: node scripts/import-adiga-universities.mjs <general-results.html> <college-results.html> [output.json]");
  process.exit(1);
}

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function splitUniversityName(value) {
  const match = value.match(/^(.*?)\[([^\]]+)\]$/);
  return match ? { name: match[1], campus: match[2] } : { name: value, campus: "본교" };
}

async function extract(filePath, institutionType) {
  const html = await readFile(filePath, "utf8");
  const rows = [...html.matchAll(/onclick="fnCompareChoose\(this, (\{.*?\})\);"/g)];
  return rows.map((match) => {
    const item = JSON.parse(decodeHtml(match[1]));
    const { name, campus } = splitUniversityName(item.unvNm);
    return {
      id: item.unvCd,
      name,
      campus,
      displayName: item.unvNm,
      institutionType,
      region: item.areaNm,
      admissionCapacity: item.totalMtcltnFixnCnt,
      departmentCount: item.scsbjtCnt,
      admissionTrackCount: item.slcnCnt,
      earlyCompetitionRate: item.transCnrt ? Number(item.transCnrt) : null,
      regularCompetitionRate: item.rdsnCnrt ? Number(item.rdsnCnrt) : null,
      academicYear: 2027,
      registryStatus: "official_registry",
      detailStatus: ["한양대학교", "연세대학교", "성균관대학교", "서강대학교"].includes(name)
        ? "verified_detail"
        : "registry_only",
      officialInfoUrl: `https://www.adiga.kr/ucp/uvt/${institutionType === "일반대학" ? "uni/univDetail.do?menuId=PCUVTINF2000" : "col/collDetail.do?menuId=PCUVTINF3000"}&unvCd=${item.unvCd}&searchSyr=2027`
    };
  });
}

const universities = [
  ...await extract(generalPath, "일반대학"),
  ...await extract(collegePath, "전문대학")
].sort((a, b) => a.name.localeCompare(b.name, "ko") || a.campus.localeCompare(b.campus, "ko"));

const duplicateIds = universities.filter((item, index) => universities.findIndex((candidate) => candidate.id === item.id) !== index);
if (duplicateIds.length) throw new Error(`duplicate Adiga university IDs: ${duplicateIds.map((item) => item.id).join(", ")}`);

const output = {
  metadata: {
    academicYear: 2027,
    collectedAt: "2026-09-08",
    sourceName: "대입정보포털 어디가",
    sourceUrl: "https://www.adiga.kr/ucp/uvt/uni/univView.do?menuId=PCUVTINF2000",
    scope: "2027학년도 대학정보에 공개된 일반대학 및 전문대학 캠퍼스 단위 목록",
    notice: "대학명 등록은 상세 수시전형 검증 완료를 의미하지 않습니다. 상세 조건은 대학별 최종 모집요강 검수 후 공개합니다."
  },
  universities
};

await writeFile(path.resolve(outputPath), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  total: universities.length,
  general: universities.filter((item) => item.institutionType === "일반대학").length,
  college: universities.filter((item) => item.institutionType === "전문대학").length,
  detailVerified: universities.filter((item) => item.detailStatus === "verified_detail").length
}));
