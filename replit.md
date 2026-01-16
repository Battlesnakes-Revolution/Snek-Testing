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
- **Tests Table**: Stores test scenarios with board state, expected safe moves, snake identification, submitter info (ownerId), and optional description
- **TestRuns Table**: Tracks async test execution with status (running/completed/failed), results, and timing

### Security Features
- User authentication via Google OAuth with server-side token verification (using jose library)
- Legacy email/password login still supported for existing accounts, but new registrations disabled
- Admin access controlled via `isAdmin` field in user document (set manually in Convex dashboard)
- Rate limiting: 5 login attempts per 5-minute window
- Internal mutations for sensitive operations (e.g., updateTestRunResult)

### Test Execution
- Tests run asynchronously via the useAsyncTestRun hook
- Test runs are recorded in the testRuns table for tracking and history
- Admin panel displays submitter's Google name for submitted tests

### Test Submission Workflow
- Users submit tests which start with "pending" status
- Admins can approve, reject, or perma-reject tests from the admin panel
- **Rejected tests**: Users can resubmit these to pending status
- **Perma-rejected tests**: Cannot be resubmitted; admin uses this for tests that should never be approved
- The `permaRejected` field on tests table tracks permanent rejection status

### Admin Setup
To make a user an admin:
1. Have them register a normal account
2. Go to the Convex dashboard (https://dashboard.convex.dev)
3. Find the user in the `users` table
4. Set `isAdmin: true`

### Super Admin Setup
Super admins have elevated privileges beyond regular admins, including the ability to ban Google accounts.

To make a user a super admin:
1. Have them register a normal account
2. Go to the Convex dashboard (https://dashboard.convex.dev)
3. Find the user in the `users` table
4. Set both `isAdmin: true` and `isSuperAdmin: true`

### User Banning (Super Admin Only)
- Super admins can ban Google accounts from the "User Management" tab in the admin panel
- Banned users are immediately logged out and cannot sign in again
- The `bannedGoogleAccounts` table tracks all banned accounts with reason and who banned them
- Super admins can also unban accounts from the same interface
- Super admins cannot ban other super admins

### Engine Analysis Feature
The platform includes an external engine analysis feature that allows users to get AI-powered move suggestions for test scenarios.

**Usage Limits:**
- Regular users: 5 uses per month (resets monthly)
- Super admins: Unlimited usage
- Banned users: Cannot use the engine

**Environment Variables (set in Convex dashboard):**
- `ENGINE_ANALYSE_URL`: The URL of the external engine analysis API
- `ENGINE_ANALYSE_PASSWORD`: The password/API key sent as `passwrd` field in requests

**Admin Controls:**
- Super admins can ban/unban users from engine usage via "Ban Engine" / "Allow Engine" buttons in User Management
- The `bannedFromEngine` field on users table tracks this restriction

**API Payload Format:**
The engine receives a POST request with:
```json
{
  "game": { "id": "...", "ruleset": {...}, "timeout": 500 },
  "turn": 0,
  "board": { "width": 11, "height": 11, "food": [...], "hazards": [...], "snakes": [...] },
  "you": { "id": "...", "name": "...", "health": 100, ... },
  "passwrd": "configured-password"
}
```

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