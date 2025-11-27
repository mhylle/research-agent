export type LogEventType =
  // Planning phase events
  | 'planning_started'
  | 'planning_iteration'
  | 'plan_created'
  | 'phase_added'
  | 'step_added'
  | 'step_modified'
  | 'step_removed'
  | 'synthesis_phase_auto_added'
  | 'auto_recovery'
  | 'step_auto_added'
  // Execution events
  | 'phase_started'
  | 'phase_completed'
  | 'phase_failed'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'step_skipped'
  // Milestone events (granular progress feedback)
  | 'milestone_started'
  | 'milestone_progress'
  | 'milestone_completed'
  // Re-planning events
  | 'replan_triggered'
  | 'replan_completed'
  // Evaluation events
  | 'evaluation_started'
  | 'evaluation_completed'
  | 'evaluation_failed'
  // Tool execution events
  | 'tool_call_started'
  | 'tool_call_completed'
  | 'tool_call_failed'
  // LLM execution events
  | 'llm_call_started'
  | 'llm_call_completed'
  // Session events
  | 'session_started'
  | 'session_completed'
  | 'session_failed';
