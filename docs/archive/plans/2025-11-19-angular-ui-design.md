# Angular UI Design for Research Agent

**Date**: 2025-11-19
**Status**: Approved
**Phase**: Phase 2 - Web UI Implementation

## Overview

Single-page Angular application providing a chat-style interface for the research agent. Built with Angular 18+ standalone components, plain SCSS styling, and Signal-based state management.

## Design Decisions

### Project Structure
**Decision**: Integrated in current repository
**Rationale**: Simplifies development and deployment, avoids CORS complexity, enables shared TypeScript types between backend and frontend. Can split later if needed (YAGNI principle).

### Technology Stack
- **Framework**: Angular 18+ (standalone components, no NgModules)
- **Language**: TypeScript 5+
- **Styling**: Plain SCSS with BEM methodology
- **State Management**: Angular Signals for reactive state
- **HTTP Client**: Angular HttpClient with interceptors
- **Build Tool**: Angular CLI

### UI Pattern
**Decision**: Single-page chat-style interface
**Rationale**: Familiar user experience, simple navigation, focused workflow. Results appear as cards below search input with visible query history on same page.

### State Management
**Decision**: Angular Signals
**Rationale**: Modern reactive primitives built into Angular 18+, performance optimized, less boilerplate than RxJS/NgRx. Perfect for straightforward state needs (query results, loading states, history).

## Architecture

### Directory Structure

```
research-agent/
├── src/                    # NestJS backend
├── client/                 # Angular frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/                    # Core services, guards, interceptors
│   │   │   │   ├── services/
│   │   │   │   │   └── research.service.ts
│   │   │   │   └── interceptors/
│   │   │   │       └── error.interceptor.ts
│   │   │   ├── shared/                  # Shared components, pipes, directives
│   │   │   │   └── components/
│   │   │   ├── features/                # Feature modules
│   │   │   │   └── research/
│   │   │   │       ├── research.component.ts
│   │   │   │       └── components/
│   │   │   │           ├── search-input/
│   │   │   │           ├── loading-indicator/
│   │   │   │           ├── result-card/
│   │   │   │           ├── sources-list/
│   │   │   │           └── error-message/
│   │   │   ├── models/                  # TypeScript interfaces
│   │   │   │   ├── research-query.model.ts
│   │   │   │   ├── research-result.model.ts
│   │   │   │   └── error-response.model.ts
│   │   │   ├── app.component.ts
│   │   │   ├── app.config.ts
│   │   │   └── app.routes.ts
│   │   ├── styles/                      # Global SCSS
│   │   │   ├── _variables.scss
│   │   │   ├── _mixins.scss
│   │   │   ├── _reset.scss
│   │   │   ├── _layout.scss
│   │   │   ├── _typography.scss
│   │   │   └── styles.scss
│   │   ├── assets/                      # Images, fonts, icons
│   │   ├── environments/
│   │   │   ├── environment.ts
│   │   │   └── environment.prod.ts
│   │   └── main.ts
│   ├── angular.json
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   └── package.json
├── test/
├── package.json            # Root package with scripts for both
└── ...
```

## Component Architecture

### Component Hierarchy

```
AppComponent (root)
└── ResearchComponent (main feature)
    ├── SearchInputComponent
    │   └── Query input and submission
    ├── LoadingIndicatorComponent
    │   └── Three-stage progress display
    ├── ResultCardComponent (repeats for each result)
    │   ├── Query, answer, and metadata display
    │   └── SourcesListComponent
    │       └── Expandable source list with links
    └── ErrorMessageComponent
        └── User-friendly error display
```

### Component Specifications

#### SearchInputComponent
**Responsibility**: Query input and submission

**Features**:
- Large textarea for multi-line queries
- Submit button (disabled while loading)
- Character count display
- Input validation (min 3 characters)
- Clear button when text present
- Auto-focus on load

**Outputs**:
- `querySubmitted: EventEmitter<string>` - Emits query text to parent

**SCSS**:
- `.search-input` block
- Focus states with primary color
- Responsive sizing

#### LoadingIndicatorComponent
**Responsibility**: Visual feedback during research

**Features**:
- Three-stage progress indicator
- Current stage highlight (1/2/3)
- Stage descriptions:
  - Stage 1: "Analyzing query & searching..."
  - Stage 2: "Fetching content from sources..."
  - Stage 3: "Synthesizing comprehensive answer..."
- Animated spinner or progress bar
- Estimated time remaining (based on ~66s average)

**Inputs**:
- `currentStage: Signal<number | null>` - Active stage number

#### ResultCardComponent
**Responsibility**: Display individual research result

**Features**:
- Query text display (truncated if long)
- Answer text (markdown rendering support)
- Timestamp (relative format: "2 minutes ago")
- Execution time breakdown
- Copy answer button
- Expand/collapse functionality
- Visual success/error state

**Inputs**:
- `result: ResearchResult` - Complete result object

**Child Components**:
- SourcesListComponent

#### SourcesListComponent
**Responsibility**: Display sources with metadata

**Features**:
- Collapsible list of sources
- Each source shows:
  - Title (linked to URL)
  - URL (truncated display)
  - Relevance badge (high/medium/low)
- Open links in new tab
- Color-coded relevance indicators

**Inputs**:
- `sources: Source[]` - Array of source objects

#### ErrorMessageComponent
**Responsibility**: User-friendly error display

**Features**:
- Icon for error type
- User-friendly error message
- Retry button (when applicable)
- Dismiss button
- Auto-dismiss after 10 seconds (optional)

**Inputs**:
- `error: Signal<string | null>` - Error message

**Outputs**:
- `retry: EventEmitter<void>` - Retry action
- `dismiss: EventEmitter<void>` - Dismiss action

## State Management

### ResearchService

**File**: `core/services/research.service.ts`

**Responsibilities**:
- API communication with backend
- State management using Signals
- LocalStorage persistence for history

**Signals**:
```typescript
currentQuery = signal<string>('');
isLoading = signal<boolean>(false);
currentStage = signal<number | null>(null);
currentResult = signal<ResearchResult | null>(null);
error = signal<string | null>(null);
history = signal<ResearchResult[]>([]);
```

**Computed Signals**:
```typescript
hasResults = computed(() => this.history().length > 0);
canSubmit = computed(() =>
  this.currentQuery().trim().length >= 3 && !this.isLoading()
);
```

**Methods**:
```typescript
async submitQuery(query: string): Promise<void>
  - Sets isLoading(true)
  - Clears previous error
  - POSTs to /api/research/query
  - Updates currentResult on success
  - Adds to history array
  - Persists to localStorage
  - Sets isLoading(false)

clearError(): void
  - Sets error(null)

loadHistoryFromStorage(): void
  - Loads from localStorage on init
  - Parses JSON and validates
  - Sets history signal

saveHistoryToStorage(): void
  - Saves history to localStorage
  - Keeps last 20 results
  - Stringifies to JSON

retryLastQuery(): void
  - Re-submits currentQuery value
```

**State Flow**:
1. User submits query → `isLoading.set(true)`, `error.set(null)`
2. HTTP POST to backend API
3. On success:
   - `currentResult.set(result)`
   - `history.update(prev => [result, ...prev].slice(0, 20))`
   - `saveHistoryToStorage()`
   - `isLoading.set(false)`
4. On error:
   - `error.set(userFriendlyMessage)`
   - `isLoading.set(false)`

### HTTP Interceptor

**File**: `core/interceptors/error.interceptor.ts`

**Responsibilities**:
- Catch HTTP errors
- Map error codes to user-friendly messages
- Log errors to console
- Retry logic for 503 errors

**Error Mapping**:
```typescript
const errorMessages = {
  0: 'Cannot connect to server. Please check your connection.',
  400: 'Invalid request. Please check your input.',
  404: 'Endpoint not found. Please contact support.',
  500: 'Server error occurred. Please try again.',
  503: 'Service temporarily unavailable. Retrying...',
};
```

**Retry Logic**:
- Automatically retry 503 errors (max 3 attempts)
- Exponential backoff: 1s, 2s, 4s
- Show "Retrying..." message to user

## Data Models

### TypeScript Interfaces

**File**: `models/research-query.model.ts`
```typescript
export interface ResearchQuery {
  query: string;
  options?: {
    maxSources?: number;
    searchDepth?: 'quick' | 'comprehensive';
  };
}
```

**File**: `models/research-result.model.ts`
```typescript
export interface ResearchResult {
  logId: string;
  query: string;              // Original query (added by frontend)
  answer: string;
  sources: Source[];
  metadata: ResultMetadata;
  timestamp: Date;            // Added by frontend
}

export interface Source {
  url: string;
  title: string;
  relevance: 'high' | 'medium' | 'low';
}

export interface ResultMetadata {
  totalExecutionTime: number;
  stages: StageMetadata[];
}

export interface StageMetadata {
  stage: number;
  executionTime: number;
}
```

**File**: `models/error-response.model.ts`
```typescript
export interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}
```

## API Integration

### Endpoints

**Base URL**:
- Development: `http://localhost:3000/api`
- Production: `/api` (relative)

**Endpoints Used**:
1. `POST /api/research/query`
   - Request body: `ResearchQuery`
   - Response: `ResearchResult`
   - Status codes: 200 (success), 400 (validation), 500 (server error)

2. `GET /api/health`
   - Used on app initialization
   - Validates backend connectivity
   - Response: `{ status: 'healthy' | 'degraded', services: {...} }`

### Environment Configuration

**File**: `environments/environment.ts` (Development)
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api'
};
```

**File**: `environments/environment.prod.ts` (Production)
```typescript
export const environment = {
  production: true,
  apiUrl: '/api'  // Relative URL
};
```

### CORS Configuration

**Development**: NestJS enables CORS for `http://localhost:4200`
**Production**: Not needed (same origin)

## Styling Architecture

### SCSS Organization

**File**: `styles/_variables.scss`
```scss
// Colors
$primary: #2563eb;           // Blue for actions
$primary-hover: #1d4ed8;     // Darker blue
$success: #10b981;           // Green for success
$error: #ef4444;             // Red for errors
$warning: #f59e0b;           // Orange for warnings

$text-primary: #1f2937;      // Dark gray
$text-secondary: #6b7280;    // Medium gray
$text-muted: #9ca3af;        // Light gray

$bg-primary: #ffffff;        // White
$bg-secondary: #f9fafb;      // Light gray
$bg-tertiary: #f3f4f6;       // Lighter gray

$border: #e5e7eb;            // Border color
$border-focus: $primary;     // Focus state

// Spacing (8px base system)
$spacing-xs: 0.5rem;         // 8px
$spacing-sm: 1rem;           // 16px
$spacing-md: 1.5rem;         // 24px
$spacing-lg: 2rem;           // 32px
$spacing-xl: 3rem;           // 48px
$spacing-2xl: 4rem;          // 64px

// Typography
$font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
$font-size-xs: 0.75rem;      // 12px
$font-size-sm: 0.875rem;     // 14px
$font-size-base: 1rem;       // 16px
$font-size-lg: 1.125rem;     // 18px
$font-size-xl: 1.25rem;      // 20px
$font-size-2xl: 1.5rem;      // 24px
$font-size-3xl: 2rem;        // 32px

$line-height: 1.5;
$line-height-tight: 1.25;
$line-height-loose: 1.75;

// Font weights
$font-normal: 400;
$font-medium: 500;
$font-semibold: 600;
$font-bold: 700;

// Borders & Shadows
$border-radius: 8px;
$border-radius-sm: 4px;
$border-radius-lg: 12px;

$shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
$shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
$shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);

// Transitions
$transition-fast: 150ms ease-in-out;
$transition-base: 250ms ease-in-out;
$transition-slow: 350ms ease-in-out;

// Breakpoints
$breakpoint-sm: 640px;
$breakpoint-md: 768px;
$breakpoint-lg: 1024px;
$breakpoint-xl: 1280px;
```

**File**: `styles/_mixins.scss`
```scss
// Responsive breakpoints
@mixin sm {
  @media (min-width: $breakpoint-sm) { @content; }
}

@mixin md {
  @media (min-width: $breakpoint-md) { @content; }
}

@mixin lg {
  @media (min-width: $breakpoint-lg) { @content; }
}

@mixin xl {
  @media (min-width: $breakpoint-xl) { @content; }
}

// Flexbox utilities
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

// Truncate text
@mixin truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// Card style
@mixin card {
  background: $bg-primary;
  border: 1px solid $border;
  border-radius: $border-radius;
  padding: $spacing-md;
  box-shadow: $shadow-sm;
}

// Button reset
@mixin button-reset {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
}
```

### Component Styling Pattern

**BEM Methodology**: `.block__element--modifier`

**Example** - `result-card.component.scss`:
```scss
@import '../../../styles/variables';
@import '../../../styles/mixins';

.result-card {
  @include card;
  margin-bottom: $spacing-md;
  transition: box-shadow $transition-base;

  &:hover {
    box-shadow: $shadow-md;
  }

  &__header {
    @include flex-between;
    margin-bottom: $spacing-sm;
  }

  &__query {
    font-size: $font-size-sm;
    color: $text-secondary;
    @include truncate;
    max-width: 70%;
  }

  &__timestamp {
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__answer {
    color: $text-primary;
    line-height: $line-height-loose;
    margin-bottom: $spacing-sm;
  }

  &__meta {
    @include flex-between;
    padding-top: $spacing-sm;
    border-top: 1px solid $border;
  }

  &__execution-time {
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  &__actions {
    display: flex;
    gap: $spacing-xs;
  }
}
```

## Error Handling

### Error Types

```typescript
enum ErrorType {
  NETWORK = 'Cannot connect to server. Please check your connection.',
  VALIDATION = 'Please enter a valid search query (minimum 3 characters).',
  SERVER = 'Server error occurred. Please try again.',
  TIMEOUT = 'Request timed out. The query may be too complex.',
  OLLAMA = 'AI service unavailable. Please ensure Ollama is running.',
  TAVILY = 'Search service unavailable. Please check API configuration.',
  UNKNOWN = 'An unexpected error occurred. Please try again.'
}
```

### Error Display Strategy

**Toast Notifications** (auto-dismiss):
- Network errors
- Timeout errors
- Generic server errors

**Inline Messages** (require dismiss):
- Validation errors
- Service unavailable errors
- Configuration errors

**Error Component Features**:
- Icon indicating error type
- User-friendly message
- "Retry" button (when applicable)
- "Dismiss" button
- Auto-dismiss after 10 seconds for non-critical errors

### HTTP Error Handling

**Interceptor Logic**:
1. Catch all HTTP errors
2. Map status codes to ErrorType
3. Check if retryable (503 status)
4. Log to console for debugging
5. Return user-friendly error message

**Retry Strategy**:
- 503 Service Unavailable → Automatic retry (max 3 attempts)
- Exponential backoff: 1s, 2s, 4s
- Show "Retrying..." status to user
- Cancel retry if user submits new query

## Loading States

### Three-Stage Progress

**Stage Definitions**:
```typescript
const STAGES = {
  1: {
    label: 'Analyzing query & searching...',
    description: 'AI is analyzing your question and searching the web',
    color: $primary
  },
  2: {
    label: 'Fetching content from sources...',
    description: 'Retrieving full content from relevant sources',
    color: $primary
  },
  3: {
    label: 'Synthesizing comprehensive answer...',
    description: 'AI is creating a comprehensive response',
    color: $success
  }
};
```

**Visual Elements**:
- Progress bar showing stage completion (33%, 66%, 100%)
- Current stage label and description
- Animated spinner or dots
- Estimated time remaining (based on average execution time)
- Disable query input during loading

**Implementation**:
- LoadingIndicatorComponent receives `currentStage` signal
- Updates automatically as backend progresses
- Smooth transitions between stages
- SCSS animations for spinner/progress bar

## Development Workflow

### NPM Scripts

**Root `package.json`**:
```json
{
  "scripts": {
    "start:dev": "nest start --watch",
    "client:dev": "cd client && ng serve",
    "dev": "concurrently \"npm run start:dev\" \"npm run client:dev\"",
    "build": "nest build",
    "client:build": "cd client && ng build --configuration production",
    "build:all": "npm run build && npm run client:build"
  }
}
```

### Development Servers

**Backend (NestJS)**:
- Port: 3000
- URL: `http://localhost:3000`
- Command: `npm run start:dev`
- CORS enabled for `http://localhost:4200`

**Frontend (Angular)**:
- Port: 4200
- URL: `http://localhost:4200`
- Command: `npm run client:dev`
- Proxy to backend API configured

**Both Running**:
- Command: `npm run dev`
- Uses `concurrently` package
- Runs both servers simultaneously

### Angular Proxy Configuration

**File**: `client/proxy.conf.json`
```json
{
  "/api": {
    "target": "http://localhost:3000",
    "secure": false,
    "logLevel": "debug"
  }
}
```

**Usage in `angular.json`**:
```json
{
  "serve": {
    "options": {
      "proxyConfig": "proxy.conf.json"
    }
  }
}
```

## Production Build & Deployment

### Build Process

**Step 1: Build Angular App**
```bash
cd client
ng build --configuration production
```
- Outputs to `client/dist/client/browser/`
- Minified and optimized bundles
- Source maps disabled
- AOT compilation enabled

**Step 2: Build NestJS App**
```bash
npm run build
```
- Outputs to `dist/`
- TypeScript compiled to JavaScript

**Step 3: Copy Angular Build to NestJS**
```bash
# Automated in build script
cp -r client/dist/client/browser/* dist/client/
```

### NestJS Static File Serving

**File**: `src/app.module.ts`
```typescript
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client'),
      exclude: ['/api*'],
    }),
    // ... other modules
  ],
})
export class AppModule {}
```

**Install Dependency**:
```bash
npm install @nestjs/serve-static
```

### Deployment Configuration

**Environment Variables**:
```bash
NODE_ENV=production
PORT=3000
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:14b
TAVILY_API_KEY=your_api_key
```

**Start Production Server**:
```bash
NODE_ENV=production npm run start:prod
```

**Nginx Configuration (Optional)**:
```nginx
server {
  listen 80;
  server_name research-agent.example.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

## Testing Strategy

### Unit Tests

**Components**:
- Test component rendering
- Test user interactions (click, input)
- Test signal updates
- Mock ResearchService

**Services**:
- Test API calls with HttpTestingController
- Test signal state changes
- Test localStorage operations
- Test error handling

**Example** - `research.service.spec.ts`:
```typescript
describe('ResearchService', () => {
  let service: ResearchService;
  let httpMock: HttpTestingController;

  it('should update isLoading signal during query', async () => {
    const query = 'test query';
    service.submitQuery(query);

    expect(service.isLoading()).toBe(true);

    const req = httpMock.expectOne('/api/research/query');
    req.flush(mockResult);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(service.isLoading()).toBe(false);
  });
});
```

### E2E Tests

**Scenarios**:
1. Submit query and display result
2. Display loading states during processing
3. Handle network errors gracefully
4. Load history from localStorage
5. Clear history functionality

**Tool**: Playwright or Cypress

### Manual Testing Checklist

- [ ] Query submission works
- [ ] Loading indicator shows correct stages
- [ ] Results display correctly
- [ ] Sources are clickable and open in new tab
- [ ] Error messages display for invalid queries
- [ ] History persists across page refreshes
- [ ] Responsive design works on mobile
- [ ] Copy answer button works
- [ ] Retry button works after errors

## Future Enhancements (Phase 3+)

### Server-Sent Events (SSE)

**Backend Changes**:
- Add SSE endpoint: `GET /api/research/stream`
- Send progress updates: `{ stage: number, message: string }`
- Send partial results as they arrive

**Frontend Changes**:
- Use `EventSource` API to connect to SSE endpoint
- Update `currentStage` signal in real-time
- Display intermediate results
- Fallback to polling if SSE unavailable

### Multi-Model Support

**UI Changes**:
- Add model selector dropdown
- Display current model in use
- Store preference in localStorage

**API Changes**:
- Add `model` parameter to query request
- Backend supports dynamic model selection

### Advanced History Features

**Local Storage Enhancement**:
- Store last 50 queries (up from 20)
- Add search/filter functionality
- Export history as JSON

**Backend Integration**:
- Endpoint: `POST /api/history/save`
- Endpoint: `GET /api/history/:userId`
- Requires user authentication

### User Accounts & Authentication

**Features**:
- User registration and login
- JWT token authentication
- Cross-device history sync
- Saved queries and favorites

**Implementation**:
- Add Auth module to backend
- Add login/register components to frontend
- Store JWT in localStorage
- Add auth interceptor

## Success Criteria

**Functional**:
- ✅ User can submit research queries
- ✅ Results display with sources and metadata
- ✅ Loading states show progress
- ✅ Errors handled gracefully with retry
- ✅ History persists in localStorage

**Non-Functional**:
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Accessible (keyboard navigation, ARIA labels)
- ✅ Performance (fast load time, smooth animations)
- ✅ Clean, professional design
- ✅ Type-safe TypeScript throughout

**Technical**:
- ✅ Angular 18+ standalone components
- ✅ Signal-based state management
- ✅ SCSS with BEM methodology
- ✅ HTTP error handling with interceptors
- ✅ Production build ready

## Implementation Steps (Summary)

1. Initialize Angular app in `/client` folder
2. Set up project structure and SCSS architecture
3. Create data models matching backend DTOs
4. Implement ResearchService with Signals
5. Build core components (SearchInput, LoadingIndicator, ResultCard, etc.)
6. Add HTTP interceptor for error handling
7. Implement localStorage for history persistence
8. Style components with SCSS
9. Add responsive design breakpoints
10. Test with backend API
11. Write unit tests for components and services
12. Configure production build and NestJS static serving
13. Deploy and test in production environment
