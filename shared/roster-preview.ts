import type { RosterImportResult, RosterImportSummary } from './types';

export interface RosterPreviewSummary extends RosterImportSummary {
  studentsTransferred: number;
  studentsUnchanged: number;
}

export interface RosterPreviewResult extends RosterImportResult {
  summary: RosterPreviewSummary;
  previewToken?: string;
}
