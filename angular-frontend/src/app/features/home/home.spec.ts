import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { HomeComponent } from './home';
import { TranscriptResponse } from '../../core/models/note.model';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  const mockTranscript: TranscriptResponse = {
    success: true,
    videoId: 'dQw4w9WgXcQ',
    transcriptLanguage: 'en',
    fullText: 'Hello world this is a test lecture transcript with several key concepts.',
    segments: [
      { text: 'Hello world', offset: 0, duration: 2000 },
      { text: 'this is a test lecture transcript', offset: 2500, duration: 4000 },
      { text: 'with several key concepts', offset: 7300000, duration: 5000 }, // ~2 hours in ms
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should disable the Generate button when the input is empty', () => {
    component.videoUrl.set('');
    expect(component.isGenerateDisabled).toBe(true);
  });

  it('should enable the Generate button once a URL is typed', () => {
    component.videoUrl.set('https://youtu.be/dQw4w9WgXcQ');
    expect(component.isGenerateDisabled).toBe(false);
  });

  it('should have no error message and no success state initially', () => {
    expect(component.errorMessage()).toBeNull();
    expect(component.showSuccess()).toBe(false);
  });

  it('should clear the error message when dismissError is called', () => {
    component.errorMessage.set('Something went wrong.');
    component.dismissError();
    expect(component.errorMessage()).toBeNull();
  });

  it('should format timestamps correctly including for 2+ hour video offsets', () => {
    component.transcriptData.set(mockTranscript);
    expect(component.formatTimestamp(0)).toBe('00:00');
    expect(component.formatTimestamp(2500)).toBe('00:02');
    expect(component.formatTimestamp(7300000)).toBe('2:01:40');
  });

  it('should filter transcript segments by search query', () => {
    component.transcriptData.set(mockTranscript);
    component.transcriptSearch.set('key concepts');
    expect(component.filteredSegments().length).toBe(1);
    expect(component.filteredSegments()[0].text).toContain('key concepts');

    component.transcriptSearch.set('nonexistent keyword');
    expect(component.filteredSegments().length).toBe(0);
  });

  it('should compute estimated word count correctly', () => {
    component.transcriptData.set(mockTranscript);
    expect(component.transcriptWordCount()).toBe(12);
  });
});
