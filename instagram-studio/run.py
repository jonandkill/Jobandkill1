from dotenv import load_dotenv
load_dotenv()
import uvicorn
uvicorn.run('app.main:app',host='127.0.0.1',port=8000,reload=False,workers=1)
