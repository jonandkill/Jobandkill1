"""Configuration-only preflight; does not call Instagram or expose secrets."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from app import core
core.init_db()
result=core.readiness()
result['verification_scope']='설정 상태만 확인. 실제 OAuth·권한·게시 시험 결과가 아님.'
print(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(0 if result['ready'] else 2)
