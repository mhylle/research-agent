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
  // Plan regeneration events (evaluation feedback loop)
  | 'plan_regeneration_started'
  | 'plan_evaluation_warning'
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
  | 'session_failed'
  // Reasoning events
  | 'reasoning_thought'
  | 'reasoning_action_planned'
  | 'reasoning_observation'
  | 'reasoning_conclusion'
  // Confidence scoring events
  | 'confidence_scoring_started'
  | 'confidence_scoring_completed'
  | 'confidence_scoring_failed'
  // Self-critique events
  | 'self_critique_started'
  | 'self_critique_completed'
  | 'self_critique_failed'
  // Gap detection events
  | 'gap_detection_started'
  | 'gap_detected'
  | 'gap_detection_completed'
  // Refinement events
  | 'refinement_started'
  | 'refinement_pass'
  | 'refinement_completed'
  | 'refinement_failed'
  // Reflection events
  | 'reflection_started'
  | 'reflection_iteration'
  | 'reflection_completed'
  | 'reflection_integration_started'
  | 'reflection_integration_completed'
  | 'reflection_integration_failed'
  // Query decomposition events
  | 'decomposition_started'
  | 'sub_query_identified'
  | 'decomposition_completed'
  // Sub-query execution events
  | 'sub_query_execution_started'
  | 'sub_query_execution_completed'
  | 'final_synthesis_started'
  | 'final_synthesis_completed';
