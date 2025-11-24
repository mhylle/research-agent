export type LogEventType =
  // Planning events
  | 'plan_created'
  | 'phase_added'
  | 'step_added'
  | 'step_modified'
  | 'step_removed'
  // Execution events
  | 'phase_started'
  | 'phase_completed'
  | 'phase_failed'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'step_skipped'
  // Re-planning events
  | 'replan_triggered'
  | 'replan_completed'
  // Session events
  | 'session_started'
  | 'session_completed'
  | 'session_failed';
