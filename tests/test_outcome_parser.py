import importlib.util, pathlib, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('collector',ROOT/'scripts/collect-outcomes.py')
collector=importlib.util.module_from_spec(spec);spec.loader.exec_module(collector)
TABLE='''<p>2025학년도 전형 결과</p><table>
<tr><th rowspan="3">모집단위</th><th colspan="7">학생부교과(고교추천전형)</th></tr>
<tr><th rowspan="2">모집인원</th><th rowspan="2">경쟁률</th><th colspan="3">대학별 환산점수</th><th colspan="2">최종등록자 교과성적 학생부등급</th></tr>
<tr><th>50% cut</th><th>70% cut</th><th>총점</th><th>50% cut</th><th>70% cut</th></tr>
<tr><td>기계공학과</td><td>23</td><td>6.3</td><td>98.68</td><td>98.60</td><td>100</td><td>2.23</td><td>2.38</td></tr></table>'''
class ParserTest(unittest.TestCase):
 def test_selects_grade_not_scaled_score(self):
  rows,_=collector.extract(TABLE,{'id':'test','name':'시험'},2026)
  self.assertEqual(len(rows),1);self.assertEqual(rows[0]['grade70'],2.38)
  self.assertIsNone(rows[0]['applicants']);self.assertIsNone(rows[0]['admitted'])
 def test_does_not_assume_result_year(self):
  rows,_=collector.extract(TABLE.replace('2025학년도 전형 결과','전형 안내'),{'id':'test','name':'시험'},2026)
  self.assertEqual(rows,[])
 def test_stale_results_on_newer_page_are_not_relabelled(self):
  rows,audit=collector.extract(TABLE,{'id':'test','name':'시험'},2027)
  self.assertEqual(rows,[])
  self.assertTrue(any(r.get('reason')=='explicit_result_year_missing' for r in audit))
 def test_rejects_unknown_program_column(self):
  rows,_=collector.extract(TABLE.replace('>모집단위<','>계열<'),{'id':'test','name':'시험'},2026)
  self.assertEqual(rows,[])
 def test_does_not_label_unspecified_population_as_registrants(self):
  rows,_=collector.extract(TABLE.replace('최종등록자 교과성적','교과성적'),{'id':'test','name':'시험'},2026)
  self.assertEqual(rows,[])
 def test_enrolled_population_keeps_its_label(self):
  rows,_=collector.extract(TABLE.replace('최종등록자 교과성적','입학자 교과성적'),{'id':'test','name':'시험'},2026)
  self.assertEqual(rows[0]['metric'],'enrolled_student_grade')
 def test_generic_support_header_is_not_track_name(self):
  rows,_=collector.extract(TABLE.replace('학생부교과(고교추천전형)','지원 및 등록 현황'),{'id':'test','name':'시험'},2026)
  self.assertEqual(rows,[])
 def test_conflicting_same_series_rows_are_not_silently_overwritten(self):
  rows,audit=collector.extract(TABLE+TABLE.replace('2.38','2.88'),{'id':'test','name':'시험'},2026)
  self.assertEqual(rows,[])
  self.assertTrue(any(r.get('reason')=='conflicting_duplicate_program_track' for r in audit))
if __name__=='__main__':unittest.main()
