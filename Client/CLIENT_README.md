# Asset Manager UI

A minimalist dashboard and mobile scanning interface for tracking hardware assets. Built to connect with the FastAPI backend.

## Stack
- **Framework:** React 19 + TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS v4
- **Routing:** React Router v7

## Local Development

```bash
# Install dependencies
npm install

# Start development server
# Important: Requires --host to be accessible to phones on local network
npm run dev -- --host
```

## Features Built
1. **Admin Dashboard (`/assets`)**
   - Real-time data fetching from backend.
   - Debounced search filtering (Name, Brand, Model).
   - Modal for logging asset activity.
   
2. **Mobile Scan View (`/scan/:id` & `/assets/:id`)**
   - Instant full-page data load upon QR scan.
   - Responsive edge-to-edge grid layout matching the main dark/orange color palette.

## Configuration
Requires a `.env` file pointing to the backend API:
```env
# Point this to your local backend IP or production URL
VITE_API_URL=http://your-fastapi-backend-url:8000
```
*(To permit mobile scanning on local networks, ensure `allowedHosts` is properly configured in `vite.config.ts` if using tunneling tools like ngrok).*
