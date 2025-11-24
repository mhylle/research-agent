# ResearchHistory Component

A chat-like history view for displaying past research queries and answers.

## Features

- **Chat-like Interface**: User-friendly display of past queries and answers
- **Collapsible Items**: Click to expand/collapse full answers
- **Relative Timestamps**: Shows "2 hours ago", "Yesterday", etc.
- **Status Indicators**: Visual indicators for errors and incomplete queries
- **Navigation**: Links to detailed logs page for each query
- **Responsive**: Mobile-friendly design
- **Accessible**: Full keyboard navigation and screen reader support

## Usage

```typescript
import { ResearchHistoryComponent } from './features/research/components/research-history/research-history.component';

@Component({
  selector: 'app-my-component',
  standalone: true,
  imports: [ResearchHistoryComponent],
  template: `
    <app-research-history [maxItems]="20" />
  `
})
export class MyComponent {}
```

## Inputs

- `maxItems` (number, default: 20): Maximum number of history items to display

## Data Source

The component uses the existing `LogsService` to fetch session data:
- Calls `logsService.sessions()` for data
- Auto-loads sessions on initialization if not already loaded
- Displays newest queries first

## Visual Structure

```
┌─ Research History ──────────────────────┐
│                                          │
│ ▼ What are black holes?                 │
│   Research completed successfully        │
│   • 5 tool calls • 3 stages             │
│   2 hours ago • View details            │
│                                          │
│ ▶ How does photosynthesis work?        │
│   Yesterday • View details              │
└──────────────────────────────────────────┘
```

## States

### Empty State
- Displayed when no history exists
- Message: "No research history yet. Start by asking a question!"

### Loading State
- Shown while sessions are being fetched
- Displays animated spinner

### Error State
- Shows error message if session loading fails
- Allows user to retry

### Item States
- **Collapsed** (default): Shows query + answer preview
- **Expanded**: Shows query + full answer
- **Error**: Red indicator for failed queries
- **Incomplete**: Orange indicator for incomplete queries

## Accessibility

- Full keyboard navigation (Tab, Enter, Space)
- ARIA labels on all interactive elements
- ARIA expanded state for collapsible items
- Screen reader announcements for state changes
- Focus management
- High contrast mode support
- Reduced motion support

## Responsive Design

- Desktop: Full-width layout (max 800px)
- Mobile (<768px): Compact layout with stacked metadata

## Integration Notes

### Current Implementation
The component displays a summary extracted from `LogSession` data:
- Query text
- Status (completed/error/incomplete)
- Tool call count and stage count
- Timestamp

### Future Enhancement
To display actual answer text, the component would need:
1. Access to `LogDetail` data (which includes full answer)
2. Either:
   - Fetch detail on expansion (lazy loading)
   - Include answer in session list response
   - Cache previously fetched details

Current implementation provides a functional history view that can be enhanced as the data model evolves.

## Testing

Comprehensive test suite covers:
- Component initialization
- Empty, loading, and error states
- Expand/collapse functionality
- Timestamp formatting
- Navigation
- Accessibility
- Keyboard interaction
- Responsive design

Run tests:
```bash
npm test -- --include='**/research-history.component.spec.ts'
```

## Styling

Uses project SCSS variables and mixins:
- Colors from `_variables.scss`
- Mixins from `_mixins.scss`
- Animations for smooth transitions
- Card-based layout consistent with design system
