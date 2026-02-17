# DD-Satellite-Comms

**Live satellite coverage maps** for Iridium/Starlink/Kuiper over Ottawa.  
**Real-time TLE propagation** → elevation/path loss → coverage visualization.

## Features
- **3 Constellations**: Iridium (L-band), Starlink/Kuiper (Ka-band)
- **Live Updates**: Celestrak TLEs → satellite.js → 5s refresh
- **Link Budget**: Elevation, range, path loss (dB), availability
- **Ottawa Defaults**: 45.42°N, 75.7°W, 100m alt
- **API**: `GET /api/:constellation/coverage?lat=45.42&lng=-75.7&alt=100`

## Quick Start

### 1. Install Dependencies
**Client:**
```bash
cd client
npm install
```

**Server:**
```bash
cd server
npm install
```
### 3. Build the Client
```bash
cd client
npm run build
```

### 4. Start the Server
```bash
cd server
node server.js
```
**Open http://localhost:3001**
