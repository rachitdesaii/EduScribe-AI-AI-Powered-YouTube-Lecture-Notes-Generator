import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GenerateNotesRequest, GenerateNotesResponse, TranscriptResponse } from '../models/note.model';

/**
 * Centralized service for all HTTP communication with the backend API.
 * Components should never call HttpClient directly - they go through here.
 */
@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  /**
   * Fetches the complete caption transcript for a YouTube video.
   * Backend endpoint: POST {apiUrl}/transcript
   */
  fetchTranscript(url: string): Observable<TranscriptResponse> {
    return this.http.post<TranscriptResponse>(`${this.baseUrl}/transcript`, { url });
  }

  /**
   * Sends either a YouTube URL or direct transcript text to the backend
   * and returns structured study notes.
   * Backend endpoint: POST {apiUrl}/generate-notes
   */
  generateNotes(request: string | GenerateNotesRequest): Observable<GenerateNotesResponse> {
    const payload: GenerateNotesRequest = typeof request === 'string' ? { url: request } : request;
    return this.http.post<GenerateNotesResponse>(`${this.baseUrl}/generate-notes`, payload);
  }

  /**
   * Simple health check call to the backend, useful for diagnostics.
   * Matches the Express backend's GET /api/health route.
   */
  checkHealth(): Observable<unknown> {
    return this.http.get(`${this.baseUrl}/health`);
  }
}
