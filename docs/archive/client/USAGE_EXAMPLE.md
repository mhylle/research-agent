# ResearchHistory Component - Usage Examples

## Quick Start

### 1. Basic Usage

```typescript
// app.component.ts
import { Component } from '@angular/core';
import { ResearchHistoryComponent } from './features/research/components/research-history/research-history.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ResearchHistoryComponent],
  template: `
    <div class="container">
      <app-research-history />
    </div>
  `
})
export class AppComponent {}
```

### 2. With Custom Max Items

```typescript
@Component({
  selector: 'app-research-page',
  standalone: true,
  imports: [ResearchHistoryComponent],
  template: `
    <div class="research-page">
      <h1>Your Research History</h1>

      <!-- Show only 10 most recent items -->
      <app-research-history [maxItems]="10" />
    </div>
  `
})
export class ResearchPageComponent {}
```

### 3. Integration with Other Components

```typescript
@Component({
  selector: 'app-research-interface',
  standalone: true,
  imports: [
    SearchInputComponent,
    ResultCardComponent,
    ResearchHistoryComponent
  ],
  template: `
    <div class="research-interface">
      <!-- Search section -->
      <section class="search-section">
        <app-search-input (querySubmitted)="handleQuery($event)" />
      </section>

      <!-- Results section -->
      <section class="results-section">
        @if (currentResult) {
          <app-result-card [result]="currentResult" />
        }
      </section>

      <!-- History sidebar -->
      <aside class="history-sidebar">
        <app-research-history [maxItems]="15" />
      </aside>
    </div>
  `,
  styles: [`
    .research-interface {
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 2rem;
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    .history-sidebar {
      position: sticky;
      top: 2rem;
      max-height: calc(100vh - 4rem);
      overflow-y: auto;
    }

    @media (max-width: 768px) {
      .research-interface {
        grid-template-columns: 1fr;
      }

      .history-sidebar {
        position: relative;
        top: 0;
        max-height: none;
      }
    }
  `]
})
export class ResearchInterfaceComponent {
  currentResult: any = null;

  handleQuery(query: string): void {
    // Handle search query
  }
}
```

### 4. As a Modal/Popup

```typescript
@Component({
  selector: 'app-history-modal',
  standalone: true,
  imports: [ResearchHistoryComponent],
  template: `
    <div class="modal-overlay" (click)="close()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Research History</h2>
          <button class="close-button" (click)="close()">×</button>
        </div>

        <div class="modal-body">
          <app-research-history [maxItems]="20" />
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      border-radius: 8px;
      width: 90%;
      max-width: 800px;
      max-height: 90vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }

    .modal-body {
      overflow-y: auto;
      padding: 1.5rem;
    }

    .close-button {
      background: none;
      border: none;
      font-size: 2rem;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      width: 2rem;
      height: 2rem;
      line-height: 1;
    }

    .close-button:hover {
      color: #1f2937;
    }
  `]
})
export class HistoryModalComponent {
  close(): void {
    // Emit close event or navigate away
  }
}
```

## Component States

### Empty State Example

When there's no history, the component shows:

```
┌─────────────────────────────┐
│   Research History          │
│                             │
│        📚                   │
│   No research history yet.  │
│   Start by asking a         │
│   question!                 │
│                             │
└─────────────────────────────┘
```

### Loading State Example

While fetching data:

```
┌─────────────────────────────┐
│   Research History          │
│                             │
│        ⟳                    │
│   Loading history...        │
│                             │
└─────────────────────────────┘
```

### With Data Example

Displaying history items:

```
┌─────────────────────────────────────┐
│   Research History                  │
│                                     │
│ ▼ What are black holes?            │
│   Research completed successfully   │
│   • 5 tool calls • 3 stages        │
│   2 hours ago • View details       │
│                                     │
│ ▶ How does photosynthesis work?   │
│   Yesterday • View details         │
│                                     │
│ ▶ Explain quantum computing        │
│   ⚠️ Failed                        │
│   3 days ago • View details        │
└─────────────────────────────────────┘
```

## Integration Patterns

### Pattern 1: Dashboard Widget

```typescript
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ResearchHistoryComponent],
  template: `
    <div class="dashboard">
      <div class="widgets">
        <!-- Other widgets -->

        <div class="widget history-widget">
          <h3>Recent Research</h3>
          <app-research-history [maxItems]="5" />
        </div>
      </div>
    </div>
  `
})
export class DashboardComponent {}
```

### Pattern 2: Tab Panel

```typescript
@Component({
  selector: 'app-research-tabs',
  standalone: true,
  imports: [ResearchHistoryComponent],
  template: `
    <div class="tabs">
      <div class="tab-buttons">
        <button [class.active]="activeTab === 'search'" (click)="activeTab = 'search'">
          Search
        </button>
        <button [class.active]="activeTab === 'history'" (click)="activeTab = 'history'">
          History
        </button>
      </div>

      <div class="tab-content">
        @if (activeTab === 'search') {
          <app-search-input />
        }
        @if (activeTab === 'history') {
          <app-research-history />
        }
      </div>
    </div>
  `
})
export class ResearchTabsComponent {
  activeTab: 'search' | 'history' = 'search';
}
```

### Pattern 3: Collapsible Sidebar

```typescript
@Component({
  selector: 'app-collapsible-history',
  standalone: true,
  imports: [ResearchHistoryComponent],
  template: `
    <div class="sidebar" [class.collapsed]="isCollapsed">
      <button class="toggle-button" (click)="isCollapsed = !isCollapsed">
        {{ isCollapsed ? '→' : '←' }}
      </button>

      @if (!isCollapsed) {
        <div class="sidebar-content">
          <app-research-history [maxItems]="15" />
        </div>
      }
    </div>
  `,
  styles: [`
    .sidebar {
      width: 300px;
      transition: width 0.3s ease;
      position: relative;
    }

    .sidebar.collapsed {
      width: 40px;
    }

    .sidebar.collapsed .sidebar-content {
      display: none;
    }

    .toggle-button {
      position: absolute;
      top: 1rem;
      right: 0;
      z-index: 10;
    }
  `]
})
export class CollapsibleHistoryComponent {
  isCollapsed = false;
}
```

## Customization Examples

### Custom Styling

```typescript
@Component({
  selector: 'app-custom-history',
  standalone: true,
  imports: [ResearchHistoryComponent],
  template: `
    <div class="custom-history-wrapper">
      <app-research-history [maxItems]="10" />
    </div>
  `,
  styles: [`
    .custom-history-wrapper {
      /* Override component styles with higher specificity */

      /* Change card background */
      ::ng-deep .history-item {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      /* Change link colors */
      ::ng-deep .meta-link {
        color: #fbbf24;
      }

      /* Change expanded border color */
      ::ng-deep .history-item--expanded {
        border-color: #fbbf24;
      }
    }
  `]
})
export class CustomHistoryComponent {}
```

### Filtering by Status

```typescript
@Component({
  selector: 'app-filtered-history',
  standalone: true,
  imports: [ResearchHistoryComponent],
  template: `
    <div class="filtered-history">
      <div class="filters">
        <button (click)="statusFilter = 'all'" [class.active]="statusFilter === 'all'">
          All
        </button>
        <button (click)="statusFilter = 'completed'" [class.active]="statusFilter === 'completed'">
          Completed
        </button>
        <button (click)="statusFilter = 'error'" [class.active]="statusFilter === 'error'">
          Errors
        </button>
      </div>

      <!-- Note: This would require extending the component to support filtering -->
      <app-research-history [maxItems]="20" />
    </div>
  `
})
export class FilteredHistoryComponent {
  statusFilter: 'all' | 'completed' | 'error' = 'all';
}
```

## Testing the Component

### Manual Testing Checklist

```markdown
□ Component renders without errors
□ Empty state displays when no data
□ Loading spinner shows during data fetch
□ History items display correctly
□ Timestamps format correctly (relative time)
□ Expand/collapse works on click
□ Keyboard navigation works (Tab, Enter, Space)
□ "View details" link navigates correctly
□ Error status indicator shows for failed queries
□ Mobile responsive design works
□ Accessibility features work (screen reader, ARIA)
```

### Automated Testing

```bash
# Run unit tests
npm test -- --include='**/research-history.component.spec.ts'

# Run visual tests (requires running dev server)
npm start
npx playwright test research-history.visual.spec.ts
```

## Troubleshooting

### Component not loading sessions

**Issue**: Component shows empty state even though there should be data.

**Solution**: Ensure LogsService is properly initialized:

```typescript
// In your app initialization
constructor(private logsService: LogsService) {
  // Pre-load sessions
  this.logsService.loadSessions();
}
```

### Navigation not working

**Issue**: "View details" link doesn't navigate.

**Solution**: Ensure RouterModule is imported in your app:

```typescript
// app.config.ts
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    // ... other providers
  ]
};
```

### Styling conflicts

**Issue**: Component styles don't match your app.

**Solution**: Override styles using higher specificity or Angular view encapsulation:

```typescript
@Component({
  // ...
  encapsulation: ViewEncapsulation.None, // Use with caution
  styles: [`
    /* Your custom styles */
  `]
})
```

## Performance Tips

1. **Limit Items**: Use `[maxItems]="10"` for better performance with large history
2. **Lazy Loading**: Consider implementing virtual scrolling for 100+ items
3. **Memoization**: Component uses signals and trackBy for optimal performance
4. **Code Splitting**: Component is standalone and can be lazy-loaded

```typescript
// Lazy load in routes
{
  path: 'history',
  loadComponent: () =>
    import('./features/research/components/research-history/research-history.component')
      .then(m => m.ResearchHistoryComponent)
}
```

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari 14+, Chrome Android)

## Related Components

- **SearchInputComponent**: For submitting new queries
- **ResultCardComponent**: For displaying query results
- **LogTimelineComponent**: For detailed log visualization
- **AgentActivityView**: For real-time agent activity
