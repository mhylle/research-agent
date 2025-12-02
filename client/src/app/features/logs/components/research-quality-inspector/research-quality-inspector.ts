import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LogsService } from '../../../../core/services/logs.service';
import { RadarChartComponent, RadarSeries, RadarDataPoint } from '../../../../shared/components/radar-chart/radar-chart';
import { SourceCredibilityComponent, SourceDetail } from '../source-credibility/source-credibility';
import { SparklineComponent } from '../../../../shared/components/sparkline/sparkline';
import { SessionPickerComponent } from '../session-picker/session-picker';
import { QualityTimelineComponent, TimelineData, TimelinePhase } from '../../../../shared/components/quality-timeline/quality-timeline.component';
import { environment } from '../../../../../environments/environment';

interface EvaluationScores {
  intentAlignment?: number;
  queryCoverage?: number;
  queryAccuracy?: number;
  scopeAppropriateness?: number;
  contextRecall?: number;
  contextPrecision?: number;
  sourceQuality?: number;
  coverageCompleteness?: number;
  actionableInformation?: number;
  faithfulness?: number;
  accuracy?: number;
  answerRelevance?: number;
  focus?: number;
  completeness?: number;
  depth?: number;
}

interface PlanAttempt {
  attemptNumber: number;
  scores: EvaluationScores;
  passed: boolean;
  critique?: string;
}

interface QualityInspectorData {
  logId: string;
  query: string;
  totalDuration: number;
  planAttempts: PlanAttempt[];
  planRegenerated: boolean;
  retrievalScores?: EvaluationScores;
  answerScores?: EvaluationScores;
  hallucinationRisk: 'low' | 'medium' | 'high';
  sourceDetails?: SourceDetail[];
}

@Component({
  selector: 'app-research-quality-inspector',
  imports: [CommonModule, RadarChartComponent, SourceCredibilityComponent, SparklineComponent, SessionPickerComponent, QualityTimelineComponent],
  templateUrl: './research-quality-inspector.html',
  styleUrls: ['./research-quality-inspector.scss']
})
export class ResearchQualityInspectorComponent implements OnInit {
  logsService = inject(LogsService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  http = inject(HttpClient);

  compareLogId = signal<string | null>(null);
  compareData = signal<QualityInspectorData | null>(null);
  isLoadingCompare = signal<boolean>(false);
  showSessionPicker = signal<boolean>(false);

  inspectorData = computed<QualityInspectorData | null>(() => {
    const logDetail = this.logsService.logDetail();
    if (!logDetail) return null;

    return this.extractInspectorData(logDetail);
  });

  isCompareMode = computed(() => this.compareLogId() !== null);

  // Computed signal for timeline data to prevent excessive re-renders
  timelineData = computed<TimelineData | null>(() => {
    const data = this.inspectorData();
    if (!data) return null;

    const phases: TimelinePhase[] = [];

    // Planning Phase
    if (data.planAttempts.length > 0) {
      const planScores = data.planAttempts.map(attempt => {
        const scores = [
          attempt.scores.intentAlignment || 0,
          attempt.scores.queryCoverage || 0,
          attempt.scores.queryAccuracy || 0,
          attempt.scores.scopeAppropriateness || 0
        ].filter(s => s > 0);

        return scores.length > 0
          ? scores.reduce((sum, s) => sum + s, 0) / scores.length / 100
          : 0;
      });

      const lastAttempt = data.planAttempts[data.planAttempts.length - 1];
      phases.push({
        name: 'Planning',
        attempts: data.planAttempts.length,
        scores: planScores,
        avgScore: planScores.reduce((sum, s) => sum + s, 0) / planScores.length,
        duration: 0,
        timestamp: new Date().toISOString(),
        status: lastAttempt.passed ? 'success' : 'failed'
      });
    }

    // Search/Retrieval Phase
    if (data.retrievalScores) {
      const retrievalScoreValues = [
        data.retrievalScores.contextRecall || 0,
        data.retrievalScores.contextPrecision || 0,
        data.retrievalScores.sourceQuality || 0,
        data.retrievalScores.coverageCompleteness || 0,
        data.retrievalScores.actionableInformation || 0
      ].filter(s => s > 0);

      const avgRetrievalScore = retrievalScoreValues.length > 0
        ? retrievalScoreValues.reduce((sum, s) => sum + s, 0) / retrievalScoreValues.length / 100
        : 0;

      phases.push({
        name: 'Search',
        attempts: 1,
        scores: [avgRetrievalScore],
        avgScore: avgRetrievalScore,
        duration: 0,
        timestamp: new Date().toISOString(),
        status: avgRetrievalScore > 0.7 ? 'success' : 'failed'
      });
    }

    // Synthesis/Answer Phase
    if (data.answerScores) {
      const answerScoreValues = [
        data.answerScores.faithfulness || 0,
        data.answerScores.accuracy || 0,
        data.answerScores.answerRelevance || 0,
        data.answerScores.focus || 0,
        data.answerScores.completeness || 0,
        data.answerScores.depth || 0
      ].filter(s => s > 0);

      const avgAnswerScore = answerScoreValues.length > 0
        ? answerScoreValues.reduce((sum, s) => sum + s, 0) / answerScoreValues.length / 100
        : 0;

      phases.push({
        name: 'Synthesis',
        attempts: 1,
        scores: [avgAnswerScore],
        avgScore: avgAnswerScore,
        duration: 0,
        timestamp: new Date().toISOString(),
        status: avgAnswerScore > 0.7 ? 'success' : 'failed'
      });
    }

    return {
      phases,
      milestones: []
    };
  });

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const logId = params['logId'];
      if (logId && typeof logId === 'string') {
        this.logsService.selectSession(logId);
      }
    });

    // Check for compare query parameter
    this.route.queryParams.subscribe(params => {
      const compareId = params['compare'];
      if (compareId && typeof compareId === 'string') {
        this.loadCompareSession(compareId);
      }
    });
  }

  async loadCompareSession(logId: string): Promise<void> {
    this.compareLogId.set(logId);
    this.isLoadingCompare.set(true);

    try {
      const detail = await firstValueFrom(
        this.http.get<any>(`${environment.apiUrl}/logs/sessions/${logId}`)
      );

      const compareData = this.extractInspectorData(detail);
      this.compareData.set(compareData);
    } catch (err) {
      console.error('Failed to load compare session:', err);
      this.compareData.set(null);
    } finally {
      this.isLoadingCompare.set(false);
    }
  }

  openSessionPicker(): void {
    this.showSessionPicker.set(true);
  }

  closeSessionPicker(): void {
    this.showSessionPicker.set(false);
  }

  async onSessionSelected(logId: string): Promise<void> {
    // Update URL with compare parameter
    const currentLogId = this.route.snapshot.params['logId'];
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { compare: logId },
      queryParamsHandling: 'merge'
    });

    // Load the compare session
    await this.loadCompareSession(logId);
  }

  async clearComparison(): Promise<void> {
    this.compareLogId.set(null);
    this.compareData.set(null);

    // Remove compare query parameter
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { compare: null },
      queryParamsHandling: 'merge'
    });
  }

  calculateDelta(valueA: number | undefined, valueB: number | undefined): { delta: number; isPositive: boolean } {
    if (valueA === undefined || valueB === undefined) {
      return { delta: 0, isPositive: false };
    }

    const delta = valueA - valueB;
    return { delta, isPositive: delta >= 0 };
  }

  formatDelta(delta: number, isPositive: boolean): string {
    const sign = isPositive ? '+' : '';
    return `${sign}${delta.toFixed(0)}%`;
  }

  private extractInspectorData(logDetail: any): QualityInspectorData {
    const planAttempts: PlanAttempt[] = [];
    let retrievalScores: EvaluationScores | undefined;
    let answerScores: EvaluationScores | undefined;
    let sourceDetails: SourceDetail[] = [];

    // Extract evaluation data from log entries
    logDetail.entries.forEach((entry: any) => {
      // Plan evaluation
      if (entry.eventType === 'evaluation_completed' && entry.data?.phase === 'plan') {
        const scores = entry.data.scores || {};
        planAttempts.push({
          attemptNumber: entry.data.attemptNumber || planAttempts.length + 1,
          scores: this.normalizeScores(scores),
          passed: entry.data.passed || false,
          critique: entry.data.critique
        });
      }

      // Plan regeneration (includes previous scores and critique)
      if (entry.eventType === 'plan_regeneration_started') {
        const previousScores = entry.data?.previousScores || {};
        planAttempts.push({
          attemptNumber: entry.data?.attemptNumber || planAttempts.length + 1,
          scores: this.normalizeScores(previousScores),
          passed: false,
          critique: entry.data?.critique
        });
      }

      // Retrieval evaluation
      if (entry.eventType === 'evaluation_completed' && entry.data?.phase === 'retrieval') {
        retrievalScores = this.normalizeScores(entry.data.scores || {});

        // Extract source details
        if (entry.data.sourceDetails && Array.isArray(entry.data.sourceDetails)) {
          sourceDetails = entry.data.sourceDetails;
        }
      }

      // Answer evaluation
      if (entry.eventType === 'evaluation_completed' && entry.data?.phase === 'answer') {
        answerScores = this.normalizeScores(entry.data.scores || {});
      }
    });

    // Calculate hallucination risk
    const hallucinationRisk = this.calculateHallucinationRisk(answerScores);

    return {
      logId: logDetail.logId,
      query: logDetail.query,
      totalDuration: logDetail.totalDuration,
      planAttempts,
      planRegenerated: planAttempts.length > 1,
      retrievalScores,
      answerScores,
      hallucinationRisk,
      sourceDetails
    };
  }

  private normalizeScores(scores: any): EvaluationScores {
    // Convert scores to 0-100 range if needed
    const normalized: any = {};
    Object.keys(scores).forEach(key => {
      const value = scores[key];
      if (typeof value === 'number') {
        // Assume scores are 0-1 and convert to 0-100
        normalized[key] = value <= 1 ? value * 100 : value;
      }
    });
    return normalized as EvaluationScores;
  }

  private calculateHallucinationRisk(answerScores?: EvaluationScores): 'low' | 'medium' | 'high' {
    if (!answerScores) return 'medium';

    const faithfulness = answerScores.faithfulness || 50;
    const accuracy = answerScores.accuracy || 50;

    const avgScore = (faithfulness + accuracy) / 2;

    if (avgScore >= 80) return 'low';
    if (avgScore >= 60) return 'medium';
    return 'high';
  }

  getPlanEvolutionSeries(): RadarSeries[] {
    const data = this.inspectorData();
    if (!data || data.planAttempts.length === 0) return [];

    const series: RadarSeries[] = [];

    // First attempt (Failed)
    if (data.planAttempts.length > 0) {
      const firstAttempt = data.planAttempts[0];
      series.push({
        name: 'Attempt 1 (Failed)',
        color: '#ea580c',
        data: [
          { axis: 'Intent Alignment', value: firstAttempt.scores.intentAlignment || 0 },
          { axis: 'Query Coverage', value: firstAttempt.scores.queryCoverage || 0 },
          { axis: 'Query Accuracy', value: firstAttempt.scores.queryAccuracy || 0 },
          { axis: 'Scope', value: firstAttempt.scores.scopeAppropriateness || 0 }
        ]
      });
    }

    // Last attempt (Success)
    if (data.planAttempts.length > 1) {
      const lastAttempt = data.planAttempts[data.planAttempts.length - 1];
      series.push({
        name: `Attempt ${lastAttempt.attemptNumber} (Success)`,
        color: '#4d7c0f',
        data: [
          { axis: 'Intent Alignment', value: lastAttempt.scores.intentAlignment || 0 },
          { axis: 'Query Coverage', value: lastAttempt.scores.queryCoverage || 0 },
          { axis: 'Query Accuracy', value: lastAttempt.scores.queryAccuracy || 0 },
          { axis: 'Scope', value: lastAttempt.scores.scopeAppropriateness || 0 }
        ]
      });
    }

    return series;
  }

  getRetrievalQualitySeries(): RadarSeries[] {
    const data = this.inspectorData();
    if (!data || !data.retrievalScores) return [];

    return [{
      name: 'Retrieval Quality',
      color: '#0891b2',
      data: [
        { axis: 'Context Recall', value: data.retrievalScores.contextRecall || 0 },
        { axis: 'Context Precision', value: data.retrievalScores.contextPrecision || 0 },
        { axis: 'Source Quality', value: data.retrievalScores.sourceQuality || 0 },
        { axis: 'Coverage Completeness', value: data.retrievalScores.coverageCompleteness || 0 },
        { axis: 'Actionable Info', value: data.retrievalScores.actionableInformation || 0 }
      ]
    }];
  }

  getAnswerQualitySeries(): RadarSeries[] {
    const data = this.inspectorData();
    if (!data || !data.answerScores) return [];

    return [{
      name: 'Answer Quality',
      color: '#7c3aed',
      data: [
        { axis: 'Faithfulness', value: data.answerScores.faithfulness || 0 },
        { axis: 'Accuracy', value: data.answerScores.accuracy || 0 },
        { axis: 'Answer Relevance', value: data.answerScores.answerRelevance || 0 },
        { axis: 'Focus', value: data.answerScores.focus || 0 },
        { axis: 'Completeness', value: data.answerScores.completeness || 0 },
        { axis: 'Depth', value: data.answerScores.depth || 0 }
      ]
    }];
  }

  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  getQueryAccuracySparkline(): number[] {
    const data = this.inspectorData();
    if (!data || data.planAttempts.length === 0) return [];

    return data.planAttempts
      .map(attempt => attempt.scores.queryAccuracy || 0)
      .filter(score => score > 0);
  }

  getContextRecallSparkline(): number[] {
    const data = this.inspectorData();
    if (!data || !data.retrievalScores) return [];

    // For retrieval, we typically have one evaluation
    // Return single value as array for consistency
    const recall = data.retrievalScores.contextRecall || 0;
    return recall > 0 ? [recall] : [];
  }

  getOverallPlanProgressionSparkline(): number[] {
    const data = this.inspectorData();
    if (!data || data.planAttempts.length === 0) return [];

    // Calculate average score for each attempt across all plan metrics
    return data.planAttempts.map(attempt => {
      const scores = [
        attempt.scores.intentAlignment || 0,
        attempt.scores.queryCoverage || 0,
        attempt.scores.queryAccuracy || 0,
        attempt.scores.scopeAppropriateness || 0
      ].filter(s => s > 0);

      return scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : 0;
    });
  }

  getRetrievalProgressionSparkline(): number[] {
    const data = this.inspectorData();
    if (!data || !data.retrievalScores) return [];

    // Calculate average retrieval score
    const scores = [
      data.retrievalScores.contextRecall || 0,
      data.retrievalScores.contextPrecision || 0,
      data.retrievalScores.sourceQuality || 0,
      data.retrievalScores.coverageCompleteness || 0,
      data.retrievalScores.actionableInformation || 0
    ].filter(s => s > 0);

    const avg = scores.length > 0
      ? scores.reduce((sum, s) => sum + s, 0) / scores.length
      : 0;

    return avg > 0 ? [avg] : [];
  }

  getAnswerProgressionSparkline(): number[] {
    const data = this.inspectorData();
    if (!data || !data.answerScores) return [];

    // Calculate average answer score
    const scores = [
      data.answerScores.faithfulness || 0,
      data.answerScores.accuracy || 0,
      data.answerScores.answerRelevance || 0,
      data.answerScores.focus || 0,
      data.answerScores.completeness || 0,
      data.answerScores.depth || 0
    ].filter(s => s > 0);

    const avg = scores.length > 0
      ? scores.reduce((sum, s) => sum + s, 0) / scores.length
      : 0;

    return avg > 0 ? [avg] : [];
  }

}
