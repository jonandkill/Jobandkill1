"""Single-process Render entry point; configure before importing the ASGI app."""
import os
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv


def configure_host():
    load_dotenv(override=False)
    if not os.getenv('PUBLIC_BASE_URL'):
        public = os.getenv('RENDER_EXTERNAL_URL', '')
        host = os.getenv('RENDER_EXTERNAL_HOSTNAME', '')
        if public or host:
            os.environ['PUBLIC_BASE_URL'] = public or f'https://{host}'
    public = os.getenv('PUBLIC_BASE_URL', '').rstrip('/')
    if os.getenv('RENDER') == 'true':
        parts = urlsplit(public)
        if parts.scheme != 'https' or not parts.hostname or parts.username or parts.query or parts.fragment:
            raise RuntimeError('Render 공개 HTTPS 주소를 확인해 주세요.')
    if os.getenv('REQUIRE_PERSISTENT_DATA', 'false').lower() == 'true':
        data = Path(os.getenv('DATA_DIR', '')).resolve()
        # Refuse to keep publishing state on an ephemeral service filesystem.
        if not data.is_mount() or not os.access(data, os.W_OK):
            raise RuntimeError('DATA_DIR에 쓰기 가능한 영구 디스크를 먼저 연결해야 합니다.')
    if public:
        os.environ['PUBLIC_BASE_URL'] = public


if __name__ == '__main__':
    configure_host()
    import uvicorn
    uvicorn.run('app.main:app', host='0.0.0.0', port=int(os.getenv('PORT', '8000')), workers=1)
