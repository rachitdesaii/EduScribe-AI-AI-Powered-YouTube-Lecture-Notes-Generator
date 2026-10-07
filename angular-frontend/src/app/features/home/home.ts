import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ApiService } from '../../core/services/api';
import { GenerateNotesErrorResponse, ImportantConcept, Notes, TranscriptResponse, TranscriptSegment } from '../../core/models/note.model';

export type NotesTab = 'transcript' | 'summary' | 'keyPoints' | 'concepts' | 'actionItems' | 'all';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent {
  private readonly api = inject(ApiService);

  /** The YouTube URL input by the user. */
  readonly videoUrl = signal('');

  /** Active loading state during generation pipeline. */
  readonly loading = signal(false);

  /** Active stage for the step-by-step progress animation (1, 2, 3, or 4). */
  readonly loadingStage = signal<1 | 2 | 3 | 4>(1);

  /** Error message string or null if no error. */
  readonly errorMessage = signal<string | null>(null);

  /** Extracted video ID from current request. */
  readonly videoId = signal<string | null>(null);

  /** Generated notes data from Gemini AI. */
  readonly notes = signal<Notes | null>(null);

  /** Full transcript text and timed segments. */
  readonly transcriptData = signal<TranscriptResponse | null>(null);

  /** Active tab view - DEFAULTS TO 'transcript' with timestamps open! */
  readonly activeTab = signal<NotesTab>('transcript');

  /** Filter query to search within transcript segments. */
  readonly transcriptSearch = signal('');

  /** Display mode for the transcript: timestamped segments or continuous text. */
  readonly transcriptViewMode = signal<'segments' | 'continuous'>('segments');

  /** Feedback indicator when full notes are copied. */
  readonly copiedNotes = signal(false);

  /** Feedback indicator when summary is copied. */
  readonly copiedSummary = signal(false);

  /** Feedback indicator when transcript is copied. */
  readonly copiedTranscript = signal(false);

  /** Active concept selected by user to view details. */
  readonly selectedConcept = signal<ImportantConcept | null>(null);

  /** Whether the user has entered a non-empty URL string. */
  readonly isInputValid = computed(() => this.videoUrl().trim().length > 0);

  /** Filtered transcript segments based on search query. */
  readonly filteredSegments = computed(() => {
    const data = this.transcriptData();
    if (!data?.segments) return [];
    const query = this.transcriptSearch().trim().toLowerCase();
    if (!query) return data.segments;
    return data.segments.filter((seg) => seg.text.toLowerCase().includes(query));
  });

  /** Estimated word count of the transcript. */
  readonly transcriptWordCount = computed(() => {
    const text = this.transcriptData()?.fullText;
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  });

  /** Lecture Title derived from notes concepts or video ID. */
  readonly lectureTitle = computed(() => {
    const n = this.notes();
    if (!n) return 'Lecture Study Notes';

    if (n.importantConcepts && n.importantConcepts.length > 0) {
      const topConcept = n.importantConcepts[0].concept;
      return `${topConcept} — Complete Guide`;
    }

    const id = this.videoId();
    return id ? `Lecture Notes (Video ${id})` : 'Lecture Study Notes';
  });

  /**
   * Triggers the full AI Note generation pipeline with animated progress steps.
   */
  onGenerateNotes(): void {
    const trimmed = this.videoUrl().trim();
    if (!trimmed || this.loading()) return;

    this.loading.set(true);
    this.errorMessage.set(null);
    this.notes.set(null);
    this.transcriptData.set(null);
    this.loadingStage.set(1);
    this.activeTab.set('transcript'); // Default tab is open on transcript!

    // Animate to Stage 2 (Transcript extraction)
    setTimeout(() => {
      if (this.loading()) this.loadingStage.set(2);
    }, 600);

    // Animate to Stage 3 (AI Processing)
    setTimeout(() => {
      if (this.loading()) this.loadingStage.set(3);
    }, 1400);

    this.api.generateNotes(trimmed).subscribe({
      next: (response) => {
        this.loadingStage.set(4);
        setTimeout(() => {
          const vid = response.videoId || this.extractVideoIdFallback(trimmed);
          this.videoId.set(vid);
          this.notes.set(response.notes);

          if (response.segments && response.segments.length > 0) {
            this.transcriptData.set({
              success: true,
              videoId: vid || '',
              transcriptLanguage: response.transcriptLanguage,
              fullText: response.fullText || '',
              segments: response.segments,
            });
          }

          this.loading.set(false);
          this.activeTab.set('transcript'); // By default, full transcript with timestamps is open!
        }, 500);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Note generation failed', err);
        this.loading.set(false);
        this.errorMessage.set(this.extractErrorMessage(err));
      },
    });
  }

  /**
   * Switches the active tab.
   */
  setActiveTab(tab: NotesTab): void {
    this.activeTab.set(tab);
  }

  /**
   * Resets the entire view back to the initial state (State 1).
   */
  resetToHome(): void {
    this.errorMessage.set(null);
    this.notes.set(null);
    this.transcriptData.set(null);
    this.loading.set(false);
    this.loadingStage.set(1);
    this.videoUrl.set('');
    this.selectedConcept.set(null);
    this.activeTab.set('transcript');
  }

  /**
   * Keydown handler to submit on Enter.
   */
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && this.isInputValid() && !this.loading()) {
      this.onGenerateNotes();
    }
  }

  /**
   * Selects a concept chip to view its full explanation.
   */
  selectConcept(item: ImportantConcept): void {
    if (this.selectedConcept()?.concept === item.concept) {
      this.selectedConcept.set(null);
    } else {
      this.selectedConcept.set(item);
    }
  }

  /**
   * Copies formatted notes to clipboard with user feedback.
   */
  copyAllNotes(): void {
    const n = this.notes();
    if (!n) return;

    const sections: string[] = [
      `# ${this.lectureTitle()}`,
      `\n## OVERVIEW & SUMMARY\n${n.summary}`,
      `\n## CORE TAKEAWAYS & KEY POINTS`,
      ...n.keyPoints.map((point, i) => `${i + 1}. ${point}`),
      `\n## IMPORTANT CONCEPTS`,
      ...n.importantConcepts.map((item) => `- **${item.concept}**: ${item.explanation}`),
      `\n## ACTION ITEMS`,
      ...n.actionItems.map((item) => `- [ ] ${item}`),
    ];

    const fullText = sections.join('\n');

    navigator.clipboard?.writeText(fullText).then(() => {
      this.copiedNotes.set(true);
      setTimeout(() => this.copiedNotes.set(false), 2000);
    });
  }

  /**
   * Copies summary to clipboard.
   */
  copySummary(): void {
    const summary = this.notes()?.summary;
    if (!summary) return;

    navigator.clipboard?.writeText(summary).then(() => {
      this.copiedSummary.set(true);
      setTimeout(() => this.copiedSummary.set(false), 2000);
    });
  }

  /**
   * Copies raw full transcript to clipboard.
   */
  copyTranscript(): void {
    const text = this.transcriptData()?.fullText;
    if (!text) return;

    navigator.clipboard?.writeText(text).then(() => {
      this.copiedTranscript.set(true);
      setTimeout(() => this.copiedTranscript.set(false), 2000);
    });
  }

  /**
   * Formats millisecond offset into HH:MM:SS or MM:SS timestamp string.
   */
  formatTimestamp(offset: number): string {
    const allSegments = this.transcriptData()?.segments || [];
    const isMs = allSegments.length > 0 && allSegments[allSegments.length - 1].offset > 30000;
    const totalSeconds = isMs ? Math.floor(offset / 1000) : Math.floor(offset);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  /**
   * Generates direct link to video at timestamp offset.
   */
  getYoutubeTimestampUrl(offset: number): string {
    const videoId = this.videoId() || this.transcriptData()?.videoId;
    if (!videoId) return '#';
    const allSegments = this.transcriptData()?.segments || [];
    const isMs = allSegments.length > 0 && allSegments[allSegments.length - 1].offset > 30000;
    const totalSeconds = isMs ? Math.floor(offset / 1000) : Math.floor(offset);
    return `https://www.youtube.com/watch?v=${videoId}&t=${totalSeconds}s`;
  }

  /**
   * Extracts clean error message from backend error response.
   */
  private extractErrorMessage(err: HttpErrorResponse): string {
    const body = err.error as GenerateNotesErrorResponse | undefined;
    if (body && typeof body === 'object' && body.error?.message) {
      return body.error.message;
    }
    return 'Transcript unavailable. If a transcript isn\'t provided by the creator or auto-generated, we cannot currently structure notes. Please try another URL.';
  }

  /**
   * Fallback extractor for YouTube Video ID.
   */
  private extractVideoIdFallback(url: string): string | null {
    try {
      const match = url.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}
