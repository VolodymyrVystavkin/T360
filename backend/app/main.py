"""FastAPI application composition and existing tolerance endpoint."""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.tolerance import AnalysisRequest, AnalysisResult, Component, analyze

app = FastAPI(title='Engineering AI', version='1.0.0')
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:4200').split(','),
                   allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])


@app.get('/api/health')
def health():
    return {'status': 'ok'}


@app.post('/api/tolerance/analyze', response_model=AnalysisResult)
def tolerance_analysis(request: AnalysisRequest):
    return analyze(request)

from app.dxf.api import router as drawings_router
app.include_router(drawings_router)

from app.cad_analysis import router as cad_analysis_router
app.include_router(cad_analysis_router)
