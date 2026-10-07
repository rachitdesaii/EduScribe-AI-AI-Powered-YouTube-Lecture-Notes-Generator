import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ApiService } from '../../core/services/api';
import { GenerateNotesErrorResponse, Notes, TranscriptResponse, TranscriptSegment } from '../../core/models/note.model';

export type NotesTab = 'all' | 'summary' | 'keyPoints' | 'concepts' | 'actionItems' | 'transcript';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent {
  private readonly api = inject(ApiService);

  /** The YouTube URL typed into the input field. */
  readonly videoUrl = signal('');

  /** Raw transcript data returned from the backend. */
  readonly transcriptData = signal<TranscriptResponse | null>(null);

  /** Structured notes returned from the backend Gemini summarization. */
  readonly notes = signal<Notes | null>(null);

  /** True while transcript retrieval is in flight. */
  readonly loadingTranscript = signal(false);

  /** True while AI note generation is in flight. */
  readonly loadingNotes = signal(false);

  /** Backward-compatible combined loading signal. */
  readonly loading = computed(() => this.loadingTranscript() || this.loadingNotes());

  /** True once a search / fetch has been initiated. */
  readonly hasSearched = signal(false);

  /** Message for the inline error alert, or null when there's no error. */
  readonly errorMessage = signal<string | null>(null);

  /** Active display view / tab. */
  readonly activeTab = signal<NotesTab>('all');

  /** Filter query to search within transcript segments. */
  readonly transcriptSearch = signal('');

  /** Display mode for the transcript: timestamped segments or continuous text. */
  readonly transcriptViewMode = signal<'segments' | 'continuous'>('segments');

  /** Feedback indicator when transcript is copied. */
  readonly copiedTranscript = signal(false);

  /** Feedback indicator when summary is copied. */
  readonly copiedSummary = signal(false);

  /** True right after a successful notes generation, while results are showing. */
  readonly showSuccess = computed(
    () => !this.loadingNotes() && !this.errorMessage() && this.hasSearched() && this.notes() !== null
  );

  /** True when a search completed with no error but neither transcript nor notes came back. */
  readonly showEmptyState = computed(
    () =>
      !this.loadingTranscript() &&
      !this.loadingNotes() &&
      !this.errorMessage() &&
      this.hasSearched() &&
      this.transcriptData() === null &&
      this.notes() === null
  );

  /** Estimated word count of the full transcript text. */
  readonly transcriptWordCount = computed(() => {
    const text = this.transcriptData()?.fullText;
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  });

  /** Filtered transcript segments based on active search keyword. */
  readonly filteredSegments = computed(() => {
    const data = this.transcriptData();
    if (!data?.segments) return [];
    const query = this.transcriptSearch().trim().toLowerCase();
    if (!query) return data.segments;
    return data.segments.filter((seg) => seg.text.toLowerCase().includes(query));
  });

  get isGenerateDisabled(): boolean {
    return this.loadingTranscript() || this.videoUrl().trim().length === 0;
  }

  get isGenerateNotesDisabled(): boolean {
    return this.loadingNotes() || !this.transcriptData();
  }

  /**
   * Primary action: Fetches the full video transcript first.
   */
  onGenerateClick(): void {
    const trimmedUrl = this.videoUrl().trim();
    if (!trimmedUrl || this.loadingTranscript()) {
      return;
    }

    this.loadingTranscript.set(true);
    this.errorMessage.set(null);
    this.transcriptData.set(null);
    this.notes.set(null);
    this.activeTab.set('all');

    this.api.fetchTranscript(trimmedUrl).subscribe({
      next: (response) => {
        this.transcriptData.set(response);
        this.loadingTranscript.set(false);
        this.hasSearched.set(true);
      },
      error: (err: HttpErrorResponse) => {
        console.error('Failed to fetch transcript', err);
        this.loadingTranscript.set(false);
        this.hasSearched.set(true);
        this.transcriptData.set(null);
        this.errorMessage.set(this.extractErrorMessage(err));
      },
    });
  }

  /**
   * Secondary action: Generates AI notes from the already loaded transcript.
   * If targetTab is provided, switches to that tab once notes are ready.
   */
  onGenerateNotesClick(targetTab: NotesTab = 'all'): void {
    const transcript = this.transcriptData();
    if (!transcript || this.loadingNotes()) {
      return;
    }

    this.loadingNotes.set(true);
    this.errorMessage.set(null);

    this.api
      .generateNotes({
        transcript: transcript.fullText,
        videoId: transcript.videoId,
        transcriptLanguage: transcript.transcriptLanguage,
      })
      .subscribe({
        next: (response) => {
          this.notes.set(response.notes ?? null);
          this.loadingNotes.set(false);
          this.activeTab.set(targetTab);
          this.scrollToSection(targetTab);
        },
        error: (err: HttpErrorResponse) => {
          console.error('Failed to generate notes', err);
          this.loadingNotes.set(false);
          this.errorMessage.set(this.extractErrorMessage(err));
        },
      });
  }

  /**
   * Handles clicking on section buttons like Summary, Key Points, etc.
   * If notes already exist, switches to that view.
   * If notes do not yet exist, automatically triggers note generation and opens that view!
   */
  onSectionButtonClick(tab: NotesTab): void {
    if (tab === 'transcript') {
      this.activeTab.set('transcript');
      this.scrollToSection('transcript');
      return;
    }

    if (!this.notes()) {
      // Notes have not been generated yet -> generate them now and show this section!
      this.onGenerateNotesClick(tab);
    } else {
      this.activeTab.set(tab);
      this.scrollToSection(tab);
    }
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !this.isGenerateDisabled) {
      this.onGenerateClick();
    }
  }

  /** Dismisses the error alert. */
  dismissError(): void {
    this.errorMessage.set(null);
  }

  /** Copies full transcript to clipboard. */
  copyTranscript(): void {
    const text = this.transcriptData()?.fullText;
    if (!text) return;

    navigator.clipboard?.writeText(text).then(() => {
      this.copiedTranscript.set(true);
      setTimeout(() => this.copiedTranscript.set(false), 2000);
    });
  }

  /** Copies summary to clipboard. */
  copySummary(): void {
    const summary = this.notes()?.summary;
    if (!summary) return;

    navigator.clipboard?.writeText(summary).then(() => {
      this.copiedSummary.set(true);
      setTimeout(() => this.copiedSummary.set(false), 2000);
    });
  }

  /** Formats offset into readable HH:MM:SS or MM:SS */
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

  /** Generates direct link to video at timestamp offset */
  getYoutubeTimestampUrl(offset: number): string {
    const videoId = this.transcriptData()?.videoId;
    if (!videoId) return '#';
    const allSegments = this.transcriptData()?.segments || [];
    const isMs = allSegments.length > 0 && allSegments[allSegments.length - 1].offset > 30000;
    const totalSeconds = isMs ? Math.floor(offset / 1000) : Math.floor(offset);
    return `https://www.youtube.com/watch?v=${videoId}&t=${totalSeconds}s`;
  }

  private scrollToSection(sectionId: string): void {
    setTimeout(() => {
      const el = document.getElementById(`section-${sectionId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  }

  /**
   * Reads the backend's structured error body when present, falling back
   * to a generic message.
   */
  private extractErrorMessage(err: HttpErrorResponse): string {
    const body = err.error as GenerateNotesErrorResponse | undefined;
    if (body && typeof body === 'object' && body.error?.message) {
      return body.error.message;
    }
    return 'Something went wrong while processing the video. Please check the URL and try again.';
  }
}
