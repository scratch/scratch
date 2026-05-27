import type React from 'react';

export type ExplainerIntent =
  | 'review-change'
  | 'system-model'
  | 'feature-spec'
  | 'general-concept'
  | 'data-model'
  | 'bug-incident';

export type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'partial' | 'info';

export type Item = {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
};

export type ExplainerPageProps = {
  children: React.ReactNode;
  sidebar?: boolean;
};

export type ExplainerHeroProps = {
  intent: ExplainerIntent;
  title: string;
  summary: React.ReactNode;
  eyebrow?: string;
  children?: React.ReactNode;
};

export type ExplainerMetaProps = {
  date: string;
  published: boolean;
  items?: Item[];
};

export type BeforeAfterProps = {
  beforeTitle?: string;
  afterTitle?: string;
  before: React.ReactNode;
  after: React.ReactNode;
};

export type ExplainerChecklistProps = {
  title: string;
  items: Item[];
};

export type EvidenceItem = {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
};

export type EvidencePanelProps = {
  title?: string;
  items: EvidenceItem[];
};

export type DataTableProps = {
  children: React.ReactNode;
  caption?: React.ReactNode;
  density?: 'normal' | 'compact';
  wide?: boolean;
};

export type Metric = {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: Tone;
};

export type MetricGridProps = {
  metrics: Metric[];
};

export type ExplainerSectionProps = {
  title?: string;
  label?: string;
  tone?: Tone;
  variant?: 'default' | 'hero' | 'recessed' | 'accent';
  children: React.ReactNode;
};

export type FileMapItem = {
  path: string;
  role: React.ReactNode;
  details?: React.ReactNode;
  tone?: Tone;
};

export type FileMapProps = {
  title?: string;
  files: FileMapItem[];
};

export type PipelineStep = {
  title: string;
  detail?: React.ReactNode;
  tone?: Tone;
};

export type PipelineProps = {
  steps: PipelineStep[];
  direction?: 'horizontal' | 'vertical';
};

export type CalloutProps = {
  tone?: Tone;
  title?: React.ReactNode;
  children: React.ReactNode;
};

export type RequirementRow = {
  requirement: React.ReactNode;
  support: React.ReactNode;
  gap?: React.ReactNode;
  evidence?: React.ReactNode;
  next?: React.ReactNode;
  status?: Tone;
};

export type RequirementMatrixProps = {
  rows: RequirementRow[];
};

export type TimelineItem = {
  title: React.ReactNode;
  time?: React.ReactNode;
  detail?: React.ReactNode;
  tone?: Tone;
};

export type DecisionRecordProps = {
  title: React.ReactNode;
  decision: React.ReactNode;
  context?: React.ReactNode;
  consequences?: React.ReactNode[];
  tone?: Tone;
};

export type ConceptMapItem = {
  concept: React.ReactNode;
  detail: React.ReactNode;
  tone?: Tone;
};

export type ConceptMapProps = {
  title?: React.ReactNode;
  items: ConceptMapItem[];
};

export type FlowCardProps = {
  label?: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  tone?: Tone;
};

export type ComparisonGridItem = {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: Tone;
};

export type ComparisonGridProps = {
  leftTitle: React.ReactNode;
  rightTitle: React.ReactNode;
  left: ComparisonGridItem[];
  right: ComparisonGridItem[];
};

export type SourceCalloutProps = {
  source: React.ReactNode;
  children: React.ReactNode;
  tone?: Tone;
};

export type RiskItem = {
  risk: React.ReactNode;
  impact?: React.ReactNode;
  mitigation?: React.ReactNode;
  tone?: Tone;
};

export type StepItem = {
  title: React.ReactNode;
  detail?: React.ReactNode;
  tone?: Tone;
};

export type GlossaryItem = {
  term: React.ReactNode;
  definition: React.ReactNode;
};

export type ArtifactLink = {
  label: React.ReactNode;
  href?: string;
  detail?: React.ReactNode;
  tone?: Tone;
};
