"""Small HTTP service exposing the rag-vector-lab retrieval to the Express backend.

Run from the FireAnalyst root:
    uv run --project rag-vector-lab python services/ragvl_server.py

Needs `ragvl ingest` + `ragvl build` to have been run first (see rag-vector-lab/README.md).
Endpoints: GET /health, POST /search {"query": str, "k": int}
"""
from __future__ import annotations

import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

LAB = Path(__file__).resolve().parent.parent / "rag-vector-lab"
sys.path.insert(0, str(LAB / "src"))
os.chdir(LAB)  # ragvl resolves cache/ and indexes/ relative to the lab

from ragvl.embedders import get_embedder  # noqa: E402
from ragvl.index import index_path, load_index  # noqa: E402
from ragvl.ingest import load_chunks  # noqa: E402
from ragvl.paths import INDEXES  # noqa: E402

MODEL = os.environ.get("RAGVL_MODEL", "e5-small")
INDEX = os.environ.get("RAGVL_INDEX", "hnsw")
PORT = int(os.environ.get("RAGVL_PORT", "8765"))

chunks = load_chunks()
embedder = get_embedder(MODEL)
index = load_index(INDEX, index_path(INDEXES, MODEL, INDEX), ef_search=64)
print(f"ragvl service: {len(chunks)} chunks, model={MODEL}, index={INDEX}, port={PORT}", flush=True)


# The 15 ICNF reports are near-identical in structure, so a question that names a year
# must only be answered from that year's report (otherwise numbers get mixed across years).
DOC_YEAR = {
    "01-2019-10-16-RPIR-08-01jan-15out": 2019,
    "01-RPIR-06-1jan-15set2018": 2018,
    "01-RPIR-10-1jan-31out-2017": 2017,
    "02-RPIF-09-15out2013": 2013,
    "02-RPIF-10-2010out15": 2010,
    "02-RPIF-10-2011out31": 2011,
    "02-RPIR-09-20151015_ICNF_DPFVAP_RIF9": 2015,
    "02-RPIR-09-rel-prov-1jan-15out-2016": 2016,
    "03-9Rel-Prov-incend-2014-10-15": 2014,
    "04-RPIF-10-15out2012": 2012,
    "2020-10-27-R08-RPI-01jan-15outubro": 2020,
    "2021-11-02-ICNF-RPIR-8-1jan-15out": 2021,
    "2022-10-18-RPIR-n8-1jan-15out2022": 2022,
    "20231019-ICNF-8RelatorioProvisorioIncendios-1jan-a-15out-2023": 2023,
    "20241104-8RelIcRurais-1jan-15out": 2024,
}
chunk_year = [DOC_YEAR.get(Path(c["doc"]).stem) for c in chunks]
YEAR_RE = re.compile(r"(?<![0-9])(20(?:1[0-9]|2[0-4]))(?![0-9])")
exact = load_index("flat", index_path(INDEXES, MODEL, "flat"))


def detect_years(query: str):
    return sorted({int(y) for y in YEAR_RE.findall(query)} & set(chunk_year))


def search(query: str, k: int):
    qv = embedder.embed_queries([query])
    years = detect_years(query)
    if years:
        # Exact search over all chunks, keep only the requested years' reports.
        # With several years (comparisons) take the best chunks of each year.
        scores, idx = exact.search(qv, len(chunks))
        ranked = [(s, i) for s, i in zip(scores[0], idx[0]) if i >= 0]
        per_year = max(1, k // len(years)) if len(years) > 1 else k
        pairs = []
        for y in years:
            pairs += [(s, i) for s, i in ranked if chunk_year[i] == y][:per_year]
        pairs.sort(key=lambda p: -p[0])
    else:
        scores, idx = index.search(qv, k)
        pairs = [(s, i) for s, i in zip(scores[0], idx[0]) if i >= 0]
    return [
        {"id": chunks[i]["id"], "source": chunks[i]["doc"], "text": chunks[i]["text"],
         "score": float(s), "year": chunk_year[i]}
        for s, i in pairs
    ]


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True, "chunks": len(chunks), "model": MODEL, "index": INDEX})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/search":
            return self._send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(n) or b"{}")
            query = str(req.get("query", "")).strip()
            k = max(1, min(int(req.get("k", 5)), 20))
            if not query:
                return self._send(400, {"error": "query is required"})
            self._send(200, {"results": search(query, k)})
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": str(e)})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
