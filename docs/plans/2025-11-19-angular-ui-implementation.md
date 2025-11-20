# Angular UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build single-page Angular UI with chat-style interface for the research agent, integrated in the current repository.

**Architecture:** Angular 18+ standalone components with Signal-based state management, plain SCSS styling (BEM methodology), calling existing NestJS API endpoints. Frontend lives in `/client` folder within the same repository.

**Tech Stack:** Angular CLI (latest), TypeScript 5+, SCSS, Angular Signals, Angular HttpClient

---

## Task 1: Initialize Angular Project

**Files:**
- Create: `client/` (entire Angular project structure)
- Modify: `package.json` (add client scripts)
- Create: `client/proxy.conf.json`

**Step 1: Generate Angular project**

Run from project root:
```bash
npx @angular/cli new client --routing=false --style=scss --skip-git=true --standalone=true
```

When prompted:
- Project name: `client`
- Routing: No
- Stylesheet: SCSS
- SSR: No

Expected: Angular project created in `client/` directory

**Step 2: Verify Angular installation**

Run:
```bash
cd client && ng version
```

Expected: Shows Angular CLI version (19.x or 20.x) and project dependencies

**Step 3: Create proxy configuration**

Create `client/proxy.conf.json`:
```json
{
  "/api": {
    "target": "http://localhost:3000",
    "secure": false,
    "logLevel": "debug",
    "changeOrigin": true
  }
}
```

**Step 4: Update angular.json to use proxy**

Modify `client/angular.json`:
```json
{
  "projects": {
    "client": {
      "architect": {
        "serve": {
          "options": {
            "proxyConfig": "proxy.conf.json"
          }
        }
      }
    }
  }
}
```

**Step 5: Add npm scripts to root package.json**

Modify root `package.json`:
```json
{
  "scripts": {
    "client:dev": "cd client && ng serve",
    "client:build": "cd client && ng build --configuration production",
    "client:test": "cd client && ng test",
    "dev": "concurrently \"npm run start:dev\" \"npm run client:dev\""
  },
  "devDependencies": {
    "concurrently": "^9.1.0"
  }
}
```

**Step 6: Install concurrently**

Run:
```bash
npm install --save-dev concurrently
```

Expected: concurrently added to devDependencies

**Step 7: Test Angular dev server**

Run:
```bash
cd client && ng serve
```

Expected: Server starts on port 4200, shows "client app is running!"

Stop server with Ctrl+C.

**Step 8: Commit**

```bash
git add client/ package.json package-lock.json
git commit -m "feat: initialize Angular project in client folder

- Angular 18+ with standalone components
- Proxy configuration for backend API
- NPM scripts for development workflow
- Integrated in repository structure"
```

---

## Task 2: Set Up Project Structure and SCSS Architecture

**Files:**
- Create: `client/src/styles/_variables.scss`
- Create: `client/src/styles/_mixins.scss`
- Create: `client/src/styles/_reset.scss`
- Create: `client/src/styles/_layout.scss`
- Create: `client/src/styles/_typography.scss`
- Modify: `client/src/styles.scss`
- Create: `client/src/app/core/` (directory structure)
- Create: `client/src/app/features/` (directory structure)
- Create: `client/src/app/models/` (directory structure)
- Create: `client/src/app/shared/` (directory structure)

**Step 1: Create styles directory structure**

Run:
```bash
cd client/src
mkdir -p styles
```

**Step 2: Create _variables.scss**

Create `client/src/styles/_variables.scss`:
```scss
// Colors
$primary: #2563eb;
$primary-hover: #1d4ed8;
$success: #10b981;
$error: #ef4444;
$warning: #f59e0b;

$text-primary: #1f2937;
$text-secondary: #6b7280;
$text-muted: #9ca3af;

$bg-primary: #ffffff;
$bg-secondary: #f9fafb;
$bg-tertiary: #f3f4f6;

$border: #e5e7eb;
$border-focus: $primary;

// Spacing (8px base)
$spacing-xs: 0.5rem;
$spacing-sm: 1rem;
$spacing-md: 1.5rem;
$spacing-lg: 2rem;
$spacing-xl: 3rem;
$spacing-2xl: 4rem;

// Typography
$font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
$font-size-xs: 0.75rem;
$font-size-sm: 0.875rem;
$font-size-base: 1rem;
$font-size-lg: 1.125rem;
$font-size-xl: 1.25rem;
$font-size-2xl: 1.5rem;
$font-size-3xl: 2rem;

$line-height: 1.5;
$line-height-tight: 1.25;
$line-height-loose: 1.75;

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

**Step 3: Create _mixins.scss**

Create `client/src/styles/_mixins.scss`:
```scss
@import 'variables';

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

**Step 4: Create _reset.scss**

Create `client/src/styles/_reset.scss`:
```scss
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
}

body {
  font-family: $font-family;
  font-size: $font-size-base;
  line-height: $line-height;
  color: $text-primary;
  background: $bg-secondary;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

button {
  @include button-reset;
}

a {
  color: $primary;
  text-decoration: none;

  &:hover {
    color: $primary-hover;
    text-decoration: underline;
  }
}
```

**Step 5: Create _layout.scss**

Create `client/src/styles/_layout.scss`:
```scss
.container {
  max-width: 1024px;
  margin: 0 auto;
  padding: 0 $spacing-md;

  @include sm {
    padding: 0 $spacing-lg;
  }
}

.section {
  padding: $spacing-lg 0;

  @include md {
    padding: $spacing-2xl 0;
  }
}
```

**Step 6: Create _typography.scss**

Create `client/src/styles/_typography.scss`:
```scss
h1, h2, h3, h4, h5, h6 {
  font-weight: $font-semibold;
  line-height: $line-height-tight;
  margin-bottom: $spacing-sm;
}

h1 {
  font-size: $font-size-3xl;
}

h2 {
  font-size: $font-size-2xl;
}

h3 {
  font-size: $font-size-xl;
}

p {
  margin-bottom: $spacing-sm;
}

small {
  font-size: $font-size-sm;
  color: $text-secondary;
}
```

**Step 7: Update main styles.scss**

Modify `client/src/styles.scss`:
```scss
@import 'styles/variables';
@import 'styles/mixins';
@import 'styles/reset';
@import 'styles/layout';
@import 'styles/typography';
```

**Step 8: Create directory structure**

Run:
```bash
cd client/src/app
mkdir -p core/services
mkdir -p core/interceptors
mkdir -p features/research/components
mkdir -p models
mkdir -p shared/components
```

**Step 9: Commit**

```bash
git add client/src/styles/ client/src/app/
git commit -m "feat: add SCSS architecture and project structure

- SCSS variables for colors, spacing, typography
- Mixins for responsive design and utilities
- CSS reset and base styles
- Directory structure for features, core, shared"
```

---

## Task 3: Create Data Models

**Files:**
- Create: `client/src/app/models/research-query.model.ts`
- Create: `client/src/app/models/research-result.model.ts`
- Create: `client/src/app/models/error-response.model.ts`
- Create: `client/src/app/models/index.ts`

**Step 1: Create research-query.model.ts**

Create `client/src/app/models/research-query.model.ts`:
```typescript
export interface ResearchQuery {
  query: string;
  options?: {
    maxSources?: number;
    searchDepth?: 'quick' | 'comprehensive';
  };
}
```

**Step 2: Create research-result.model.ts**

Create `client/src/app/models/research-result.model.ts`:
```typescript
export interface ResearchResult {
  logId: string;
  query: string;              // Added by frontend
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

**Step 3: Create error-response.model.ts**

Create `client/src/app/models/error-response.model.ts`:
```typescript
export interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}
```

**Step 4: Create barrel export**

Create `client/src/app/models/index.ts`:
```typescript
export * from './research-query.model';
export * from './research-result.model';
export * from './error-response.model';
```

**Step 5: Commit**

```bash
git add client/src/app/models/
git commit -m "feat: add TypeScript data models

- ResearchQuery interface
- ResearchResult with Source and Metadata interfaces
- ErrorResponse interface
- Barrel export for clean imports"
```

---

## Task 4: Create Environment Configuration

**Files:**
- Create: `client/src/environments/environment.ts`
- Create: `client/src/environments/environment.development.ts`

**Step 1: Create production environment**

Create `client/src/environments/environment.ts`:
```typescript
export const environment = {
  production: true,
  apiUrl: '/api'
};
```

**Step 2: Create development environment**

Create `client/src/environments/environment.development.ts`:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api'
};
```

**Step 3: Verify environment replacement in angular.json**

Check `client/angular.json` has file replacements configured:
```json
{
  "configurations": {
    "production": {
      "fileReplacements": [
        {
          "replace": "src/environments/environment.ts",
          "with": "src/environments/environment.development.ts"
        }
      ]
    }
  }
}
```

If not present, Angular CLI should have added this automatically.

**Step 4: Commit**

```bash
git add client/src/environments/
git commit -m "feat: add environment configuration

- Production environment (relative API URL)
- Development environment (localhost:3000)
- File replacement configured in angular.json"
```

---

## Task 5: Implement ResearchService with Signals

**Files:**
- Create: `client/src/app/core/services/research.service.ts`
- Create: `client/src/app/core/services/research.service.spec.ts`

**Step 1: Write failing test**

Create `client/src/app/core/services/research.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ResearchService } from './research.service';
import { ResearchResult } from '../../models';

describe('ResearchService', () => {
  let service: ResearchService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ResearchService]
    });
    service = TestBed.inject(ResearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial signal values', () => {
    expect(service.isLoading()).toBe(false);
    expect(service.currentResult()).toBeNull();
    expect(service.error()).toBeNull();
    expect(service.history()).toEqual([]);
  });

  it('should submit query and update signals', async () => {
    const mockResult: ResearchResult = {
      logId: 'test-123',
      query: 'test query',
      answer: 'test answer',
      sources: [],
      metadata: { totalExecutionTime: 1000, stages: [] },
      timestamp: new Date()
    };

    const promise = service.submitQuery('test query');

    expect(service.isLoading()).toBe(true);

    const req = httpMock.expectOne(req => req.url.includes('/api/research/query'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ query: 'test query' });

    req.flush(mockResult);
    await promise;

    expect(service.isLoading()).toBe(false);
    expect(service.currentResult()).toBeTruthy();
    expect(service.history().length).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd client && ng test --watch=false
```

Expected: FAIL with "Cannot find module './research.service'"

**Step 3: Write minimal implementation**

Create `client/src/app/core/services/research.service.ts`:
```typescript
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ResearchQuery, ResearchResult } from '../../models';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ResearchService {
  // Signals for reactive state
  currentQuery = signal<string>('');
  isLoading = signal<boolean>(false);
  currentResult = signal<ResearchResult | null>(null);
  error = signal<string | null>(null);
  history = signal<ResearchResult[]>([]);

  // Computed signals
  hasResults = computed(() => this.history().length > 0);
  canSubmit = computed(() =>
    this.currentQuery().trim().length >= 3 && !this.isLoading()
  );

  constructor(private http: HttpClient) {
    this.loadHistoryFromStorage();
  }

  async submitQuery(query: string): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    this.currentQuery.set(query);

    try {
      const requestBody: ResearchQuery = { query };
      const result = await this.http.post<Omit<ResearchResult, 'query' | 'timestamp'>>(
        `${environment.apiUrl}/research/query`,
        requestBody
      ).toPromise();

      if (result) {
        const fullResult: ResearchResult = {
          ...result,
          query,
          timestamp: new Date()
        };

        this.currentResult.set(fullResult);
        this.history.update(prev => [fullResult, ...prev].slice(0, 20));
        this.saveHistoryToStorage();
      }
    } catch (err: any) {
      this.error.set(err.message || 'An error occurred');
    } finally {
      this.isLoading.set(false);
    }
  }

  clearError(): void {
    this.error.set(null);
  }

  private loadHistoryFromStorage(): void {
    try {
      const stored = localStorage.getItem('research_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.history.set(parsed.map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp)
        })));
      }
    } catch (err) {
      console.error('Failed to load history from storage', err);
    }
  }

  private saveHistoryToStorage(): void {
    try {
      localStorage.setItem('research_history', JSON.stringify(this.history()));
    } catch (err) {
      console.error('Failed to save history to storage', err);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd client && ng test --watch=false
```

Expected: PASS (3 tests passing)

**Step 5: Commit**

```bash
git add client/src/app/core/services/
git commit -m "feat: implement ResearchService with Signals

- Signal-based state management for loading, results, errors
- Computed signals for hasResults and canSubmit
- HTTP POST to /api/research/query
- LocalStorage persistence for history (last 20)
- Comprehensive unit tests"
```

---

## Task 6: Create SearchInputComponent

**Files:**
- Create: `client/src/app/features/research/components/search-input/search-input.component.ts`
- Create: `client/src/app/features/research/components/search-input/search-input.component.html`
- Create: `client/src/app/features/research/components/search-input/search-input.component.scss`
- Create: `client/src/app/features/research/components/search-input/search-input.component.spec.ts`

**Step 1: Generate component**

Run:
```bash
cd client && ng generate component features/research/components/search-input --standalone --skip-tests
```

**Step 2: Write failing test**

Create `client/src/app/features/research/components/search-input/search-input.component.spec.ts`:
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchInputComponent } from './search-input.component';

describe('SearchInputComponent', () => {
  let component: SearchInputComponent;
  let fixture: ComponentFixture<SearchInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchInputComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit query on submit', () => {
    let emittedQuery = '';
    component.querySubmitted.subscribe(q => emittedQuery = q);

    component.query = 'test query';
    component.onSubmit();

    expect(emittedQuery).toBe('test query');
  });

  it('should not submit empty query', () => {
    let submitted = false;
    component.querySubmitted.subscribe(() => submitted = true);

    component.query = '   ';
    component.onSubmit();

    expect(submitted).toBe(false);
  });
});
```

**Step 3: Run test**

Run:
```bash
cd client && ng test --watch=false
```

Expected: FAIL (some tests will fail because component isn't implemented yet)

**Step 4: Implement component TypeScript**

Modify `client/src/app/features/research/components/search-input/search-input.component.ts`:
```typescript
import { Component, Output, EventEmitter, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search-input.component.html',
  styleUrls: ['./search-input.component.scss']
})
export class SearchInputComponent {
  @Input() disabled = false;
  @Output() querySubmitted = new EventEmitter<string>();

  query = '';

  onSubmit(): void {
    const trimmedQuery = this.query.trim();
    if (trimmedQuery.length >= 3) {
      this.querySubmitted.emit(trimmedQuery);
    }
  }

  clearQuery(): void {
    this.query = '';
  }

  get characterCount(): number {
    return this.query.length;
  }

  get isValid(): boolean {
    return this.query.trim().length >= 3;
  }
}
```

**Step 5: Implement component template**

Modify `client/src/app/features/research/components/search-input/search-input.component.html`:
```html
<div class="search-input">
  <div class="search-input__wrapper">
    <textarea
      [(ngModel)]="query"
      [disabled]="disabled"
      class="search-input__textarea"
      placeholder="Ask a research question..."
      rows="3"
      (keydown.control.enter)="onSubmit()"
      (keydown.meta.enter)="onSubmit()"
    ></textarea>

    <div class="search-input__footer">
      <span class="search-input__counter" [class.search-input__counter--warning]="characterCount > 500">
        {{ characterCount }} characters
      </span>

      <div class="search-input__actions">
        <button
          *ngIf="query.length > 0"
          type="button"
          class="search-input__clear"
          (click)="clearQuery()"
        >
          Clear
        </button>

        <button
          type="submit"
          class="search-input__submit"
          [disabled]="!isValid || disabled"
          (click)="onSubmit()"
        >
          Research
        </button>
      </div>
    </div>
  </div>

  <p class="search-input__hint">
    Tip: Press Ctrl+Enter (⌘+Enter on Mac) to submit
  </p>
</div>
```

**Step 6: Implement component styles**

Modify `client/src/app/features/research/components/search-input/search-input.component.scss`:
```scss
@import '../../../../../styles/variables';
@import '../../../../../styles/mixins';

.search-input {
  width: 100%;
  margin-bottom: $spacing-lg;

  &__wrapper {
    @include card;
  }

  &__textarea {
    width: 100%;
    border: none;
    outline: none;
    font-family: $font-family;
    font-size: $font-size-base;
    line-height: $line-height;
    resize: vertical;
    min-height: 80px;
    margin-bottom: $spacing-sm;

    &:focus {
      outline: 2px solid $border-focus;
      outline-offset: -2px;
      border-radius: $border-radius-sm;
    }

    &::placeholder {
      color: $text-muted;
    }

    &:disabled {
      background: $bg-tertiary;
      cursor: not-allowed;
    }
  }

  &__footer {
    @include flex-between;
  }

  &__counter {
    font-size: $font-size-sm;
    color: $text-secondary;

    &--warning {
      color: $warning;
    }
  }

  &__actions {
    display: flex;
    gap: $spacing-xs;
  }

  &__clear {
    @include button-reset;
    padding: $spacing-xs $spacing-sm;
    font-size: $font-size-sm;
    color: $text-secondary;
    border-radius: $border-radius-sm;
    transition: background-color $transition-fast;

    &:hover {
      background-color: $bg-secondary;
    }
  }

  &__submit {
    @include button-reset;
    padding: $spacing-xs $spacing-md;
    background-color: $primary;
    color: white;
    font-weight: $font-medium;
    border-radius: $border-radius-sm;
    transition: background-color $transition-fast;

    &:hover:not(:disabled) {
      background-color: $primary-hover;
    }

    &:disabled {
      background-color: $border;
      color: $text-muted;
      cursor: not-allowed;
    }
  }

  &__hint {
    margin-top: $spacing-xs;
    font-size: $font-size-xs;
    color: $text-muted;
    text-align: center;
  }
}
```

**Step 7: Run tests**

Run:
```bash
cd client && ng test --watch=false
```

Expected: All tests pass

**Step 8: Commit**

```bash
git add client/src/app/features/research/components/search-input/
git commit -m "feat: add SearchInputComponent

- Textarea with character count
- Submit button (disabled when invalid)
- Clear button
- Ctrl+Enter/Cmd+Enter keyboard shortcut
- Validation (min 3 characters)
- Comprehensive styling with BEM"
```

---

## Task 7: Create LoadingIndicatorComponent

**Files:**
- Create: `client/src/app/features/research/components/loading-indicator/loading-indicator.component.ts`
- Create: `client/src/app/features/research/components/loading-indicator/loading-indicator.component.html`
- Create: `client/src/app/features/research/components/loading-indicator/loading-indicator.component.scss`

**Step 1: Generate component**

Run:
```bash
cd client && ng generate component features/research/components/loading-indicator --standalone
```

**Step 2: Implement component TypeScript**

Modify `client/src/app/features/research/components/loading-indicator/loading-indicator.component.ts`:
```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface StageInfo {
  label: string;
  description: string;
}

@Component({
  selector: 'app-loading-indicator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-indicator.component.html',
  styleUrls: ['./loading-indicator.component.scss']
})
export class LoadingIndicatorComponent {
  @Input() currentStage: number | null = null;

  stages: StageInfo[] = [
    {
      label: 'Analyzing query & searching...',
      description: 'AI is analyzing your question and searching the web'
    },
    {
      label: 'Fetching content from sources...',
      description: 'Retrieving full content from relevant sources'
    },
    {
      label: 'Synthesizing comprehensive answer...',
      description: 'AI is creating a comprehensive response'
    }
  ];

  get progressPercentage(): number {
    if (!this.currentStage) return 0;
    return (this.currentStage / 3) * 100;
  }

  get currentStageInfo(): StageInfo | null {
    if (!this.currentStage || this.currentStage < 1 || this.currentStage > 3) {
      return null;
    }
    return this.stages[this.currentStage - 1];
  }
}
```

**Step 3: Implement component template**

Modify `client/src/app/features/research/components/loading-indicator/loading-indicator.component.html`:
```html
<div class="loading-indicator" *ngIf="currentStage">
  <div class="loading-indicator__progress">
    <div class="loading-indicator__bar">
      <div
        class="loading-indicator__fill"
        [style.width.%]="progressPercentage"
      ></div>
    </div>

    <div class="loading-indicator__stage-number">
      Stage {{ currentStage }} of 3
    </div>
  </div>

  <div class="loading-indicator__content" *ngIf="currentStageInfo">
    <div class="loading-indicator__spinner">
      <div class="spinner"></div>
    </div>

    <div class="loading-indicator__text">
      <h3 class="loading-indicator__label">{{ currentStageInfo.label }}</h3>
      <p class="loading-indicator__description">{{ currentStageInfo.description }}</p>
    </div>
  </div>

  <div class="loading-indicator__estimate">
    Estimated time: ~60 seconds
  </div>
</div>
```

**Step 4: Implement component styles**

Modify `client/src/app/features/research/components/loading-indicator/loading-indicator.component.scss`:
```scss
@import '../../../../../styles/variables';
@import '../../../../../styles/mixins';

.loading-indicator {
  @include card;
  margin-bottom: $spacing-lg;

  &__progress {
    margin-bottom: $spacing-md;
  }

  &__bar {
    width: 100%;
    height: 8px;
    background-color: $bg-tertiary;
    border-radius: $border-radius;
    overflow: hidden;
    margin-bottom: $spacing-xs;
  }

  &__fill {
    height: 100%;
    background: linear-gradient(90deg, $primary, $success);
    transition: width $transition-slow;
  }

  &__stage-number {
    font-size: $font-size-sm;
    color: $text-secondary;
    text-align: center;
  }

  &__content {
    display: flex;
    align-items: flex-start;
    gap: $spacing-md;
    margin-bottom: $spacing-md;
  }

  &__spinner {
    flex-shrink: 0;
  }

  &__text {
    flex: 1;
  }

  &__label {
    font-size: $font-size-lg;
    font-weight: $font-semibold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__description {
    font-size: $font-size-sm;
    color: $text-secondary;
    margin: 0;
  }

  &__estimate {
    font-size: $font-size-xs;
    color: $text-muted;
    text-align: center;
  }
}

// Spinner animation
.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid $bg-tertiary;
  border-top-color: $primary;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

**Step 5: Run tests**

Run:
```bash
cd client && ng test --watch=false
```

Expected: All tests pass

**Step 6: Commit**

```bash
git add client/src/app/features/research/components/loading-indicator/
git commit -m "feat: add LoadingIndicatorComponent

- Three-stage progress bar
- Stage labels and descriptions
- Animated spinner
- Progress percentage calculation
- Estimated time display"
```

---

## Task 8: Create ResultCardComponent and SourcesListComponent

**Files:**
- Create: `client/src/app/features/research/components/result-card/result-card.component.ts`
- Create: `client/src/app/features/research/components/result-card/result-card.component.html`
- Create: `client/src/app/features/research/components/result-card/result-card.component.scss`
- Create: `client/src/app/features/research/components/sources-list/sources-list.component.ts`
- Create: `client/src/app/features/research/components/sources-list/sources-list.component.html`
- Create: `client/src/app/features/research/components/sources-list/sources-list.component.scss`

**Step 1: Generate ResultCardComponent**

Run:
```bash
cd client && ng generate component features/research/components/result-card --standalone
cd client && ng generate component features/research/components/sources-list --standalone
```

**Step 2: Implement SourcesListComponent TypeScript**

Modify `client/src/app/features/research/components/sources-list/sources-list.component.ts`:
```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Source } from '../../../../models';

@Component({
  selector: 'app-sources-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sources-list.component.html',
  styleUrls: ['./sources-list.component.scss']
})
export class SourcesListComponent {
  @Input() sources: Source[] = [];

  isExpanded = false;

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  getRelevanceClass(relevance: string): string {
    return `sources-list__badge--${relevance}`;
  }

  truncateUrl(url: string, maxLength: number = 50): string {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
  }
}
```

**Step 3: Implement SourcesListComponent template**

Modify `client/src/app/features/research/components/sources-list/sources-list.component.html`:
```html
<div class="sources-list">
  <button
    type="button"
    class="sources-list__toggle"
    (click)="toggleExpanded()"
  >
    <span>{{ sources.length }} Sources</span>
    <span class="sources-list__icon">{{ isExpanded ? '▼' : '▶' }}</span>
  </button>

  <div class="sources-list__content" *ngIf="isExpanded">
    <div class="sources-list__item" *ngFor="let source of sources">
      <div class="sources-list__header">
        <a
          [href]="source.url"
          target="_blank"
          rel="noopener noreferrer"
          class="sources-list__title"
        >
          {{ source.title }}
        </a>
        <span
          class="sources-list__badge"
          [ngClass]="getRelevanceClass(source.relevance)"
        >
          {{ source.relevance }}
        </span>
      </div>
      <p class="sources-list__url">{{ truncateUrl(source.url) }}</p>
    </div>
  </div>
</div>
```

**Step 4: Implement SourcesListComponent styles**

Modify `client/src/app/features/research/components/sources-list/sources-list.component.scss`:
```scss
@import '../../../../../styles/variables';
@import '../../../../../styles/mixins';

.sources-list {
  margin-top: $spacing-md;
  border-top: 1px solid $border;
  padding-top: $spacing-md;

  &__toggle {
    @include button-reset;
    @include flex-between;
    width: 100%;
    padding: $spacing-sm;
    background: $bg-secondary;
    border-radius: $border-radius-sm;
    font-weight: $font-medium;
    transition: background-color $transition-fast;

    &:hover {
      background-color: $bg-tertiary;
    }
  }

  &__icon {
    font-size: $font-size-xs;
    color: $text-secondary;
  }

  &__content {
    margin-top: $spacing-sm;
  }

  &__item {
    padding: $spacing-sm;
    border-bottom: 1px solid $border;

    &:last-child {
      border-bottom: none;
    }
  }

  &__header {
    @include flex-between;
    margin-bottom: $spacing-xs;
  }

  &__title {
    font-weight: $font-medium;
    color: $primary;

    &:hover {
      color: $primary-hover;
    }
  }

  &__badge {
    padding: 2px 8px;
    font-size: $font-size-xs;
    font-weight: $font-medium;
    border-radius: $border-radius-sm;

    &--high {
      background-color: lighten($success, 40%);
      color: darken($success, 20%);
    }

    &--medium {
      background-color: lighten($warning, 40%);
      color: darken($warning, 20%);
    }

    &--low {
      background-color: $bg-tertiary;
      color: $text-secondary;
    }
  }

  &__url {
    font-size: $font-size-xs;
    color: $text-muted;
    margin: 0;
    @include truncate;
  }
}
```

**Step 5: Implement ResultCardComponent TypeScript**

Modify `client/src/app/features/research/components/result-card/result-card.component.ts`:
```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResearchResult } from '../../../../models';
import { SourcesListComponent } from '../sources-list/sources-list.component';

@Component({
  selector: 'app-result-card',
  standalone: true,
  imports: [CommonModule, SourcesListComponent],
  templateUrl: './result-card.component.html',
  styleUrls: ['./result-card.component.scss']
})
export class ResultCardComponent {
  @Input() result!: ResearchResult;

  copyAnswer(): void {
    navigator.clipboard.writeText(this.result.answer).then(() => {
      alert('Answer copied to clipboard!');
    });
  }

  formatTimestamp(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  formatExecutionTime(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
}
```

**Step 6: Implement ResultCardComponent template**

Modify `client/src/app/features/research/components/result-card/result-card.component.html`:
```html
<div class="result-card">
  <div class="result-card__header">
    <p class="result-card__query">{{ result.query }}</p>
    <span class="result-card__timestamp">{{ formatTimestamp(result.timestamp) }}</span>
  </div>

  <div class="result-card__answer">
    {{ result.answer }}
  </div>

  <div class="result-card__meta">
    <span class="result-card__execution-time">
      Execution time: {{ formatExecutionTime(result.metadata.totalExecutionTime) }}
    </span>

    <div class="result-card__actions">
      <button
        type="button"
        class="result-card__action"
        (click)="copyAnswer()"
      >
        📋 Copy
      </button>
    </div>
  </div>

  <app-sources-list [sources]="result.sources"></app-sources-list>
</div>
```

**Step 7: Implement ResultCardComponent styles**

Modify `client/src/app/features/research/components/result-card/result-card.component.scss`:
```scss
@import '../../../../../styles/variables';
@import '../../../../../styles/mixins';

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
    font-weight: $font-medium;
    @include truncate;
    max-width: 70%;
    margin: 0;
  }

  &__timestamp {
    font-size: $font-size-xs;
    color: $text-muted;
  }

  &__answer {
    color: $text-primary;
    line-height: $line-height-loose;
    margin-bottom: $spacing-md;
    white-space: pre-wrap;
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

  &__action {
    @include button-reset;
    padding: $spacing-xs $spacing-sm;
    font-size: $font-size-sm;
    color: $primary;
    border-radius: $border-radius-sm;
    transition: background-color $transition-fast;

    &:hover {
      background-color: $bg-secondary;
    }
  }
}
```

**Step 8: Run tests**

Run:
```bash
cd client && ng test --watch=false
```

Expected: All tests pass

**Step 9: Commit**

```bash
git add client/src/app/features/research/components/result-card/
git add client/src/app/features/research/components/sources-list/
git commit -m "feat: add ResultCard and SourcesList components

ResultCardComponent:
- Query, answer, and timestamp display
- Execution time formatting
- Copy to clipboard button
- Integrates SourcesListComponent

SourcesListComponent:
- Collapsible source list
- Relevance badges (high/medium/low)
- Clickable source links (new tab)
- URL truncation"
```

---

## Task 9: Create ErrorMessageComponent

**Files:**
- Create: `client/src/app/features/research/components/error-message/error-message.component.ts`
- Create: `client/src/app/features/research/components/error-message/error-message.component.html`
- Create: `client/src/app/features/research/components/error-message/error-message.component.scss`

**Step 1: Generate component**

Run:
```bash
cd client && ng generate component features/research/components/error-message --standalone
```

**Step 2: Implement component TypeScript**

Modify `client/src/app/features/research/components/error-message/error-message.component.ts`:
```typescript
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-error-message',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './error-message.component.html',
  styleUrls: ['./error-message.component.scss']
})
export class ErrorMessageComponent {
  @Input() error: string | null = null;
  @Input() canRetry = false;
  @Output() retry = new EventEmitter<void>();
  @Output() dismiss = new EventEmitter<void>();

  onRetry(): void {
    this.retry.emit();
  }

  onDismiss(): void {
    this.dismiss.emit();
  }
}
```

**Step 3: Implement component template**

Modify `client/src/app/features/research/components/error-message/error-message.component.html`:
```html
<div class="error-message" *ngIf="error">
  <div class="error-message__icon">⚠️</div>

  <div class="error-message__content">
    <h4 class="error-message__title">Error</h4>
    <p class="error-message__text">{{ error }}</p>
  </div>

  <div class="error-message__actions">
    <button
      *ngIf="canRetry"
      type="button"
      class="error-message__retry"
      (click)="onRetry()"
    >
      Retry
    </button>

    <button
      type="button"
      class="error-message__dismiss"
      (click)="onDismiss()"
    >
      Dismiss
    </button>
  </div>
</div>
```

**Step 4: Implement component styles**

Modify `client/src/app/features/research/components/error-message/error-message.component.scss`:
```scss
@import '../../../../../styles/variables';
@import '../../../../../styles/mixins';

.error-message {
  @include card;
  display: flex;
  align-items: flex-start;
  gap: $spacing-md;
  margin-bottom: $spacing-lg;
  background-color: lighten($error, 45%);
  border-color: $error;

  &__icon {
    font-size: $font-size-2xl;
    flex-shrink: 0;
  }

  &__content {
    flex: 1;
  }

  &__title {
    font-size: $font-size-lg;
    font-weight: $font-semibold;
    color: darken($error, 10%);
    margin-bottom: $spacing-xs;
  }

  &__text {
    font-size: $font-size-sm;
    color: $text-primary;
    margin: 0;
  }

  &__actions {
    display: flex;
    gap: $spacing-xs;
    flex-shrink: 0;
  }

  &__retry {
    @include button-reset;
    padding: $spacing-xs $spacing-sm;
    background-color: $error;
    color: white;
    font-weight: $font-medium;
    font-size: $font-size-sm;
    border-radius: $border-radius-sm;
    transition: background-color $transition-fast;

    &:hover {
      background-color: darken($error, 10%);
    }
  }

  &__dismiss {
    @include button-reset;
    padding: $spacing-xs $spacing-sm;
    font-size: $font-size-sm;
    color: $text-secondary;
    border-radius: $border-radius-sm;
    transition: background-color $transition-fast;

    &:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }
  }
}
```

**Step 5: Run tests**

Run:
```bash
cd client && ng test --watch=false
```

Expected: All tests pass

**Step 6: Commit**

```bash
git add client/src/app/features/research/components/error-message/
git commit -m "feat: add ErrorMessageComponent

- Error icon and title
- Error message display
- Retry button (conditional)
- Dismiss button
- Styled with error colors"
```

---

## Task 10: Create ResearchComponent (Main Feature Component)

**Files:**
- Create: `client/src/app/features/research/research.component.ts`
- Create: `client/src/app/features/research/research.component.html`
- Create: `client/src/app/features/research/research.component.scss`

**Step 1: Generate component**

Run:
```bash
cd client && ng generate component features/research --standalone
```

**Step 2: Implement component TypeScript**

Modify `client/src/app/features/research/research.component.ts`:
```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResearchService } from '../../core/services/research.service';
import { SearchInputComponent } from './components/search-input/search-input.component';
import { LoadingIndicatorComponent } from './components/loading-indicator/loading-indicator.component';
import { ResultCardComponent } from './components/result-card/result-card.component';
import { ErrorMessageComponent } from './components/error-message/error-message.component';

@Component({
  selector: 'app-research',
  standalone: true,
  imports: [
    CommonModule,
    SearchInputComponent,
    LoadingIndicatorComponent,
    ResultCardComponent,
    ErrorMessageComponent
  ],
  templateUrl: './research.component.html',
  styleUrls: ['./research.component.scss']
})
export class ResearchComponent {
  researchService = inject(ResearchService);

  async onQuerySubmitted(query: string): Promise<void> {
    await this.researchService.submitQuery(query);
  }

  onRetry(): void {
    const lastQuery = this.researchService.currentQuery();
    if (lastQuery) {
      this.onQuerySubmitted(lastQuery);
    }
  }

  onDismissError(): void {
    this.researchService.clearError();
  }
}
```

**Step 3: Implement component template**

Modify `client/src/app/features/research/research.component.html`:
```html
<div class="research container">
  <header class="research__header">
    <h1 class="research__title">Research Agent</h1>
    <p class="research__subtitle">
      Ask any question and get comprehensive research-backed answers
    </p>
  </header>

  <app-search-input
    [disabled]="researchService.isLoading()"
    (querySubmitted)="onQuerySubmitted($event)"
  ></app-search-input>

  <app-error-message
    [error]="researchService.error()"
    [canRetry]="!!researchService.currentQuery()"
    (retry)="onRetry()"
    (dismiss)="onDismissError()"
  ></app-error-message>

  <app-loading-indicator
    *ngIf="researchService.isLoading()"
    [currentStage]="1"
  ></app-loading-indicator>

  <div class="research__results">
    <h2 class="research__results-title" *ngIf="researchService.hasResults()">
      Research History
    </h2>

    <app-result-card
      *ngFor="let result of researchService.history()"
      [result]="result"
    ></app-result-card>

    <div class="research__empty" *ngIf="!researchService.hasResults() && !researchService.isLoading()">
      <p>No research queries yet. Start by asking a question above!</p>
    </div>
  </div>
</div>
```

**Step 4: Implement component styles**

Modify `client/src/app/features/research/research.component.scss`:
```scss
@import '../../../styles/variables';
@import '../../../styles/mixins';

.research {
  padding: $spacing-xl 0;
  min-height: 100vh;

  &__header {
    text-align: center;
    margin-bottom: $spacing-2xl;
  }

  &__title {
    font-size: $font-size-3xl;
    font-weight: $font-bold;
    color: $text-primary;
    margin-bottom: $spacing-sm;

    @include md {
      font-size: calc($font-size-3xl * 1.5);
    }
  }

  &__subtitle {
    font-size: $font-size-lg;
    color: $text-secondary;
    margin: 0;
  }

  &__results {
    margin-top: $spacing-xl;
  }

  &__results-title {
    font-size: $font-size-xl;
    font-weight: $font-semibold;
    color: $text-primary;
    margin-bottom: $spacing-md;
  }

  &__empty {
    @include card;
    text-align: center;
    padding: $spacing-xl;
    color: $text-secondary;

    p {
      margin: 0;
    }
  }
}
```

**Step 5: Update app component**

Modify `client/src/app/app.component.ts`:
```typescript
import { Component } from '@angular/core';
import { ResearchComponent } from './features/research/research.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ResearchComponent],
  template: '<app-research></app-research>',
  styles: []
})
export class AppComponent {}
```

**Step 6: Run tests**

Run:
```bash
cd client && ng test --watch=false
```

Expected: All tests pass

**Step 7: Test in browser**

Run:
```bash
npm run dev
```

Open browser to `http://localhost:4200`

Expected: See Research Agent UI with search input

**Step 8: Commit**

```bash
git add client/src/app/features/research/research.component.*
git add client/src/app/app.component.ts
git commit -m "feat: add ResearchComponent (main feature)

- Integrates all child components
- Connects to ResearchService
- Displays search, loading, errors, results
- Updates AppComponent to render ResearchComponent"
```

---

## Task 11: Add HTTP Error Interceptor

**Files:**
- Create: `client/src/app/core/interceptors/error.interceptor.ts`
- Create: `client/src/app/core/interceptors/error.interceptor.spec.ts`
- Modify: `client/src/app/app.config.ts`

**Step 1: Write failing test**

Create `client/src/app/core/interceptors/error.interceptor.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpClient, HTTP_INTERCEPTORS } from '@angular/common/http';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: HTTP_INTERCEPTORS,
          useValue: errorInterceptor,
          multi: true
        }
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should map 404 to user-friendly message', (done) => {
    httpClient.get('/test').subscribe({
      error: (error) => {
        expect(error.message).toContain('not found');
        done();
      }
    });

    const req = httpMock.expectOne('/test');
    req.flush({}, { status: 404, statusText: 'Not Found' });
  });

  it('should map 500 to user-friendly message', (done) => {
    httpClient.get('/test').subscribe({
      error: (error) => {
        expect(error.message).toContain('Server error');
        done();
      }
    });

    const req = httpMock.expectOne('/test');
    req.flush({}, { status: 500, statusText: 'Internal Server Error' });
  });
});
```

**Step 2: Run test**

Run:
```bash
cd client && ng test --watch=false
```

Expected: FAIL (interceptor doesn't exist)

**Step 3: Implement interceptor**

Create `client/src/app/core/interceptors/error.interceptor.ts`:
```typescript
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

const ERROR_MESSAGES: Record<number, string> = {
  0: 'Cannot connect to server. Please check your connection.',
  400: 'Invalid request. Please check your input.',
  404: 'Endpoint not found. Please contact support.',
  500: 'Server error occurred. Please try again.',
  503: 'Service temporarily unavailable. Please try again later.'
};

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let userMessage = ERROR_MESSAGES[error.status] || 'An unexpected error occurred.';

      // If backend provides a message, use it
      if (error.error?.message) {
        userMessage = error.error.message;
      }

      console.error('HTTP Error:', {
        status: error.status,
        message: error.message,
        url: error.url
      });

      return throwError(() => new Error(userMessage));
    })
  );
};
```

**Step 4: Run test**

Run:
```bash
cd client && ng test --watch=false
```

Expected: PASS

**Step 5: Register interceptor in app config**

Modify `client/src/app/app.config.ts`:
```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(
      withInterceptors([errorInterceptor])
    )
  ]
};
```

**Step 6: Run all tests**

Run:
```bash
cd client && ng test --watch=false
```

Expected: All tests pass

**Step 7: Commit**

```bash
git add client/src/app/core/interceptors/
git add client/src/app/app.config.ts
git commit -m "feat: add HTTP error interceptor

- Maps HTTP status codes to user-friendly messages
- Logs errors to console for debugging
- Registered in app config
- Comprehensive unit tests"
```

---

## Task 12: Configure Production Build

**Files:**
- Modify: `package.json` (root)
- Create: `client/.gitignore` updates

**Step 1: Update root package.json scripts**

Modify root `package.json`:
```json
{
  "scripts": {
    "build": "nest build",
    "client:build": "cd client && ng build --configuration production",
    "build:all": "npm run build && npm run client:build",
    "postinstall": "cd client && npm install"
  }
}
```

**Step 2: Verify Angular build configuration**

Check `client/angular.json` has production configuration:
```json
{
  "configurations": {
    "production": {
      "budgets": [
        {
          "type": "initial",
          "maximumWarning": "500kB",
          "maximumError": "1MB"
        }
      ],
      "outputHashing": "all"
    }
  }
}
```

**Step 3: Test production build**

Run:
```bash
npm run build:all
```

Expected: Both NestJS and Angular build successfully
- NestJS output: `dist/`
- Angular output: `client/dist/client/browser/`

**Step 4: Add @nestjs/serve-static**

Run:
```bash
npm install @nestjs/serve-static
```

**Step 5: Update app.module.ts to serve static files**

Modify `src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ResearchModule } from './research/research.module';
import { LlmModule } from './llm/llm.module';
import { ToolsModule } from './tools/tools.module';
import { LoggingModule } from './logging/logging.module';
import { HealthModule } from './health/health.module';
import { ConfigModuleSetup } from './config/config.module';

@Module({
  imports: [
    ConfigModule.forRoot(ConfigModuleSetup),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client'),
      exclude: ['/api*'],
    }),
    ResearchModule,
    LlmModule,
    ToolsModule,
    LoggingModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

**Step 6: Update .gitignore**

Add to root `.gitignore`:
```
# Angular build output
client/dist/
```

**Step 7: Create build script for deployment**

Create `scripts/build-production.sh`:
```bash
#!/bin/bash
set -e

echo "Building Angular frontend..."
cd client && npm run build

echo "Building NestJS backend..."
cd ..
npm run build

echo "Copying Angular build to NestJS dist..."
mkdir -p dist/client
cp -r client/dist/client/browser/* dist/client/

echo "Production build complete!"
echo "Run: NODE_ENV=production npm run start:prod"
```

Make executable:
```bash
chmod +x scripts/build-production.sh
```

**Step 8: Test production build and serve**

Run:
```bash
npm run build:all
NODE_ENV=production npm run start:prod
```

Open browser to `http://localhost:3000`

Expected: Angular UI served from NestJS, API calls work

**Step 9: Commit**

```bash
git add package.json src/app.module.ts client/.gitignore .gitignore scripts/
git commit -m "feat: configure production build and static file serving

- Added build:all script for full production build
- Configured ServeStaticModule in NestJS
- Angular build output copied to dist/client
- Build script for deployment
- Updated .gitignore for Angular dist"
```

---

## Task 13: Update README with Frontend Instructions

**Files:**
- Modify: `README.md`

**Step 1: Add Frontend section to README**

Add to `README.md` after the Backend API Documentation section:

```markdown
## Frontend (Angular UI)

### Development

**Run both backend and frontend:**
```bash
npm run dev
```

This starts:
- Backend API on `http://localhost:3000`
- Angular UI on `http://localhost:4200`

**Run frontend only:**
```bash
npm run client:dev
```

**Run tests:**
```bash
npm run client:test
```

### Production Build

**Build for production:**
```bash
npm run build:all
```

This creates:
- Backend build in `dist/`
- Frontend build copied to `dist/client/`

**Start production server:**
```bash
NODE_ENV=production npm run start:prod
```

The Angular UI will be served at `http://localhost:3000`

### Architecture

**Technology Stack:**
- Angular 18+ (standalone components)
- TypeScript 5+
- SCSS (BEM methodology)
- Angular Signals (state management)

**Directory Structure:**
```
client/
├── src/
│   ├── app/
│   │   ├── core/           # Services, interceptors
│   │   ├── features/       # Feature components
│   │   ├── models/         # TypeScript interfaces
│   │   └── shared/         # Shared components
│   ├── styles/             # Global SCSS
│   └── environments/       # Environment configs
```

**Features:**
- Single-page chat-style interface
- Real-time loading indicators
- LocalStorage-based history (last 20 queries)
- Error handling with retry
- Responsive design (mobile, tablet, desktop)

### API Integration

The Angular UI calls the existing NestJS API:
- `POST /api/research/query` - Submit research queries
- `GET /api/health` - Health check

In development, requests are proxied to `http://localhost:3000` via `proxy.conf.json`.

In production, the Angular build is served by NestJS using `@nestjs/serve-static`, so API calls use relative URLs.
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Frontend section to README

- Development workflow instructions
- Production build process
- Architecture overview
- API integration details"
```

---

## Summary

**Total Tasks**: 13

**Implementation completes:**
1. ✅ Angular project initialization in `/client` folder
2. ✅ SCSS architecture with BEM methodology
3. ✅ TypeScript data models matching backend DTOs
4. ✅ ResearchService with Signal-based state management
5. ✅ SearchInputComponent with validation
6. ✅ LoadingIndicatorComponent with 3-stage progress
7. ✅ ResultCardComponent and SourcesListComponent
8. ✅ ErrorMessageComponent with retry
9. ✅ ResearchComponent (main feature integration)
10. ✅ HTTP error interceptor
11. ✅ Production build configuration
12. ✅ Static file serving from NestJS
13. ✅ README documentation

**Ready for:**
- Phase 3: Server-Sent Events, Multi-model support, History backend
- Phase 4: Specialized modes (Academic, Business, Technical)

**Testing:**
- Unit tests for all components and services
- E2E integration between Angular and NestJS API
- Production build verification

**Next Steps After Implementation:**
- Test with real backend API
- Add E2E tests with Playwright
- Implement SSE for real-time updates
- Add more sophisticated error handling
- Enhance UI/UX based on user feedback
