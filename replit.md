# Battlesnake Testing Platform

## Overview

This is a Battlesnake testing application built with Convex and React. The platform allows users to create, manage, and run test scenarios for Battlesnake AI development. It provides a visual interface for defining game board states and validating snake movement decisions against expected outcomes.

The application uses Convex as a serverless backend for data persistence and real-time functionality, with a React/Vite frontend for the user interface.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7 for fast development and optimized production builds
- **Styling**: Tailwind CSS 4 with custom theme variables (ink, sand, clay, ember, lagoon, moss, blood, night colors)
- **Fonts**: Space Grotesk for UI text, JetBrains Mono for code/monospace elements
- **Path Aliases**: `@/*` maps to `./src/*` for cleaner imports

### Backend Architecture
- **Platform**: Convex - serverless backend with real-time database
- **Functions**: Server-side logic defined in `convex/` directory using queries, mutations, and actions
- **Data Model**: Schema-defined tables with typed validators for game state (coordinates, snakes, boards, games)
- **API Pattern**: Auto-generated type-safe API from Convex function definitions

### Data Model
The core data structures represent Battlesnake game state:
- **Coordinate**: `{x, y}` position on the board
- **Snake**: Contains id, name, health, body coordinates, head position, length, and optional metadata
- **Board**: Dimensions, food positions, hazards, and array of snakes
- **Game**: Optional game configuration including ruleset and timeout settings
- **Tests Table**: Stores test scenarios with board state, expected safe moves, and snake identification

### Security Features
- Admin password protection via environment variable (`BATTLESNAKE_ADMIN_PASSWORD`)
- Rate limiting window of 5 minutes for certain operations

## External Dependencies

### Core Services
- **Convex**: Backend-as-a-service providing database, serverless functions, and real-time subscriptions
  - Requires `VITE_CONVEX_URL` environment variable for client connection
  - Backend functions connect automatically via Convex runtime

### Development Dependencies
- **ESLint**: Code linting with TypeScript, React Hooks, and Convex-specific rules
- **Prettier**: Code formatting
- **TypeScript**: Strict type checking across frontend and Convex functions

### Production Serving
- **serve**: Static file server for production builds (serves on port 5000)

### Build Configuration
- Vite configured for Replit deployment with host `0.0.0.0` and port `5000`
- Both dev server and preview server configured for external access