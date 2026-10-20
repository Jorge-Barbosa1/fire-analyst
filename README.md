# FireAnalyst · SeverusPT

**▶ Live demo: [proj4-severuspt.onrender.com](https://proj4-severuspt.onrender.com)** *(free Render instance — the first load can take ~30 s to wake up)*

A web app for analysing wildfires in Portugal. Draw an area on the map, pick a satellite and a date range, and FireAnalyst computes burn-severity maps and vegetation time series on Google Earth Engine. A RAG-powered chatbot answers questions about Portuguese wildfire data.

**Stack:** React · TypeScript · Vite · Express · Google Earth Engine · Leaflet · Chart.js · OpenRouter LLMs · local embeddings (Xenova Transformers)

## 🚀 Features

- **Interactive Map**: Draw polygons/rectangles to select areas of interest
- **Burn Severity Analysis**: Calculate dNBR, RdNBR, RBR and classified severity maps
- **Time Series Analysis**: Plot NDVI/NBR trends over time
- **Multi-satellite Support**: Sentinel-2, Landsat 5/7/8/9, MODIS, HLS
- **RAG-powered Chat**: Ask questions about Portuguese wildfire data
- **Burned Area Datasets**: ICNF and EFFIS historical data

## 📋 Prerequisites

- Node.js 18+ and npm
- Google Earth Engine service account credentials
- OpenRouter API key (for chat functionality)

## 🔧 Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Credentials

You have two options for GEE credentials:

**Option A: Environment Variable (Recommended for Production)**
```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your keys
DP_API_KEY=your_openrouter_api_key
GEE_PRIVATE_KEY='{"type":"service_account","project_id":"..."}'
```

**Option B: JSON File (Development)**
```bash
# Place your GEE service account JSON file at:
# src/lib/config/<your-service-account>.json

# The app will automatically load it if GEE_PRIVATE_KEY is not set
```

⚠️ **Security Note**: Never commit `*.json` credential files or `.env` to git!

### 3. Run the Application

**Development Mode** (separate frontend + backend):
```bash
# Frontend dev server (Vite)
npm run dev

# Backend server (in another terminal)
npm start
```

**Production Mode**:
```bash
# Build the React frontend
npm run build

# Start the Express server (serves built frontend + API)
npm start
```

The app will be available at:
- Frontend: http://localhost:3000
- API: http://localhost:3000/api

## 📁 Project Structure

```
src/
├── api/
│   └── routes/          # Express API routers
│       ├── chat.js      # RAG chat with OpenRouter
│       ├── rag.js       # Embeddings initialization
│       └── gee.js       # Google Earth Engine endpoints
├── components/          # React components
│   ├── map/            # Leaflet map components
│   ├── analyst/        # Analysis tools
│   ├── charts/         # Chart.js visualizations
│   └── ChatBot/        # Chat interface
├── pages/
│   └── Home.tsx        # Main application page
├── lib/
│   ├── services/       # Backend services
│   │   ├── gee-service.ts      # GEE operations
│   │   └── gee-constants.ts    # Client-safe GEE configs
│   ├── rag/           # RAG pipeline
│   │   ├── database.ts
│   │   ├── embeddings.ts
│   │   └── loadDocs.ts
│   └── utils/
│       └── gee-utils.ts # GEE authentication
└── main.tsx           # React entry point

server.js              # Express server
```

## 🌐 API Endpoints

### GEE Operations
- `POST /api/gee/burned-areas` - Fetch ICNF/EFFIS burned areas
- `POST /api/gee/time-series` - Get NDVI/NBR time series
- `POST /api/gee/severity-maps` - Generate burn severity maps
- `POST /api/gee/severity` - Calculate severity evolution
- `POST /api/gee/severity-stats` - Get severity class statistics
- `POST /api/gee/image-list` - List available satellite images

### RAG & Chat
- `POST /api/chat` - Send message to RAG-powered chatbot
- `POST /api/rag/init` - Initialize RAG embeddings
- `GET /api/rag/status` - Check RAG system status

## 🎯 Usage

1. **Select Mode**: Choose between "Mapper" (severity maps) or "Analyst" (time series)
2. **Define Area**: Draw a polygon or rectangle on the map
3. **Configure Dates**: Set pre/post fire dates or use fire date + window
4. **Select Satellite**: Choose from available satellites
5. **Generate Analysis**: Click "Generate Maps" or "Plot Time Series"
6. **Explore Results**: View interactive maps and charts

## 🔨 Development Commands

```bash
npm run dev              # Start Vite dev server (port 5173)
npm run build            # Build production bundle
npm start               # Start Express server (port 3000)
npm run create-embeddings # Initialize RAG system
```

## 🚢 Deployment

### Environment Variables for Production

```bash
DP_API_KEY=your_openrouter_key
GEE_PRIVATE_KEY='{"type":"service_account",...}'
PORT=3000
NODE_ENV=production
```

### Deploy to Render/Railway/Vercel

1. Build the app: `npm run build`
2. Set environment variables in your hosting platform
3. Start command: `npm start`
4. Ensure the `dist/` folder is served

## 📚 Technologies

- **Frontend**: React 18, TypeScript, Vite, React Router
- **Backend**: Express 4, Node.js
- **Mapping**: Leaflet, Leaflet Draw
- **Charts**: Chart.js, ApexCharts
- **AI**: OpenRouter API, Xenova Transformers (local embeddings)
- **Geospatial**: Google Earth Engine
- **Styling**: CSS, custom styles

## 🐛 Troubleshooting

**Map not rendering?**
- Check browser console for Leaflet errors
- Ensure CSS is properly loaded
- Verify `dist/` has the built assets

**GEE authentication failed?**
- Verify credentials JSON is valid
- Check the file path: `src/lib/config/<your-service-account>.json`
- Or set `GEE_PRIVATE_KEY` environment variable

**Chat not working?**
- Set `DP_API_KEY` environment variable
- Initialize RAG: `npm run create-embeddings`
- Check RAG status: `GET /api/rag/status`

