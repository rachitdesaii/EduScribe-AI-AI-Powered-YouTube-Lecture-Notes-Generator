import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';

import { ApiService } from './api';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should POST { url } (not { prompt }) to /generate-notes', () => {
    service.generateNotes('https://youtu.be/dQw4w9WgXcQ').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/generate-notes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ url: 'https://youtu.be/dQw4w9WgXcQ' });

    req.flush({
      success: true,
      videoId: 'dQw4w9WgXcQ',
      transcriptLanguage: 'en',
      notes: { summary: 's', keyPoints: [], importantConcepts: [], actionItems: [] },
    });
  });

  it('should POST { url } to /transcript', () => {
    service.fetchTranscript('https://youtu.be/dQw4w9WgXcQ').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/transcript`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ url: 'https://youtu.be/dQw4w9WgXcQ' });

    req.flush({
      success: true,
      videoId: 'dQw4w9WgXcQ',
      transcriptLanguage: 'en',
      fullText: 'test full text',
      segments: [{ text: 'test', offset: 0, duration: 1000 }],
    });
  });
});

