import { NextResponse } from 'next/server';
import {
  getAnalysisData,
  generatePromptSuggestions,
} from '@/lib/pattern-analyzer';

// GET /api/analysis - Get edit pattern analysis
export async function GET() {
  try {
    const analysisData = getAnalysisData();
    const suggestions = generatePromptSuggestions();

    // Transform patterns to API format
    const transformPattern = (pattern: {
      id: string;
      pattern_type: string;
      pattern_text: string;
      replacement_text: string | null;
      occurrence_count: number;
      first_seen: number;
      last_seen: number;
    }) => ({
      id: pattern.id,
      type: pattern.pattern_type,
      text: pattern.pattern_text,
      replacement: pattern.replacement_text,
      count: pattern.occurrence_count,
      firstSeen: pattern.first_seen,
      lastSeen: pattern.last_seen,
    });

    return NextResponse.json({
      summary: analysisData.summary,
      patterns: {
        deletions: analysisData.topDeletions.map(transformPattern),
        insertions: analysisData.topInsertions.map(transformPattern),
        replacements: analysisData.topReplacements.map(transformPattern),
        recent: analysisData.recentPatterns.map(transformPattern),
      },
      suggestions,
    });
  } catch (error) {
    console.error('Error fetching analysis data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analysis data' },
      { status: 500 }
    );
  }
}
