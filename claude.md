# CLAUDE.md - Project Development Support Document

## Project Overview

This project is an integrated drawing tool that adds custom keyboard shortcuts, sticky note features, and local file operations to Excalidraw.

## Tech Stack

### Frontend

- React 19.0.0 + TypeScript 5.0
- Vite 5.0.12
- @excalidraw/excalidraw

### Backend

- Python 3.8+ + FastAPI
- Uvicorn (ASGI server)

### Development Environment

- Node.js 18.0+
- npm package manager

## Project Structure

```
excalidraw_myao9494/
├── components/              # React components
│   └── ExampleApp.tsx      # Main application
├── hooks/                  # Custom hooks
│   ├── useKeyboardShortcuts.ts
│   └── useMousePosition.ts
├── utils/                  # Utilities
│   ├── stickyNoteUtils.ts  # Sticky note creation
│   ├── fileUtils.ts        # File operations
│   └── localStorage.ts     # Local storage
├── backend/                # FastAPI backend
│   ├── main.py            # Main server
│   └── requirements.txt   # Python dependencies
└── docs/                  # Documentation
    ├── requirements.md    # Requirements specification
    ├── features.md       # Feature specification
    ├── todo.md          # TODO list
    └── architecture.md   # System architecture
```

## Important Files

### Core Features

- `components/ExampleApp.tsx`: Main application component
- `hooks/useKeyboardShortcuts.ts`: Keyboard shortcut handling
- `utils/fileUtils.ts`: File operation APIs
- `backend/main.py`: FastAPI server

### Configuration Files

- `package.json`: Frontend dependencies
- `tsconfig.json`: TypeScript configuration
- `vite.config.ts`: Vite configuration

## Development Workflow

### 1. Environment Setup

```bash
# Frontend
npm install

# Backend
cd backend
pip install -r requirements.txt
```

### 2. Development Server Startup

```bash
# Backend (port 8000)
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend (port 3001)
npm start
```

### 3. File Operation Testing

```
http://localhost:3001/?filepath=/path/to/your/file.excalidraw
```

## Production Build and Offline Usage

### Build for Production

```bash
# Build frontend
npm run build

# The build creates a dist/ folder with static files
```

### Offline Deployment

After building, the application can run completely offline:

1. **Static File Serving**: The built files in `dist/` folder are completely self-contained
2. **Backend Independence**: File operations require the Python backend, but the core drawing functionality works offline
3. **Local File Access**: When deployed offline, use standard browser file dialogs instead of URL parameters
