import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { HomeComponent } from './home';
import { Notes, TranscriptResponse } from '../../core/models/note.model';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  const mockNotes: Notes = {
    summary: 'Database normalization is a systematic approach to eliminate redundancy.',
    keyPoints: [
      'First Normal Form (1NF): Requires atomic values.',
      'Second Normal Form (2NF): Eliminates partial dependencies.',
      'Third Normal Form (3NF): Eliminates transitive dependencies.',
    ],
    importantConcepts: [
      { concept: 'Primary Key', explanation: 'A unique identifier for a table record.' },
      { concept: '1NF', explanation: 'Atomic columns and no repeating groups.' },
    ],
    actionItems: [
      'Review primary key dependencies.',
      'Practice normalization exercises.',
    ],
  };

  const mockTranscript: TranscriptResponse = {
    success: true,
    videoId: 'dQw4w9WgXcQ',
    transcriptLanguage: 'en',
    fullText: 'Hello world this is a test lecture transcript with several key concepts.',
    segments: [
      { text: 'Hello world', offset: 0, duration: 2000 },
      { text: 'this is a test lecture transcript', offset: 2500, duration: 4000 },
      { text: 'with several key concepts', offset: 7300000, duration: 5000 },
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

  it('should have activeTab set to "transcript" by default', () => {
    expect(component.activeTab()).toBe('transcript');
  });

  it('should switch tabs when setActiveTab is called', () => {
    component.setActiveTab('summary');
    expect(component.activeTab()).toBe('summary');

    component.setActiveTab('keyPoints');
    expect(component.activeTab()).toBe('keyPoints');

    component.setActiveTab('transcript');
    expect(component.activeTab()).toBe('transcript');
  });

  it('should validate input correctly', () => {
    component.videoUrl.set('');
    expect(component.isInputValid()).toBe(false);

    component.videoUrl.set('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(component.isInputValid()).toBe(true);
  });

  it('should have initial state with no error and no notes', () => {
    expect(component.errorMessage()).toBeNull();
    expect(component.notes()).toBeNull();
    expect(component.loading()).toBe(false);
  });

  it('should compute lecture title from top concept or fallback', () => {
    component.notes.set(mockNotes);
    expect(component.lectureTitle()).toBe('Primary Key — Complete Guide');

    component.notes.set(null);
    expect(component.lectureTitle()).toBe('Lecture Study Notes');
  });

  it('should format timestamps correctly', () => {
    component.transcriptData.set(mockTranscript);
    expect(component.formatTimestamp(0)).toBe('00:00');
    expect(component.formatTimestamp(2500)).toBe('00:02');
    expect(component.formatTimestamp(7300000)).toBe('2:01:40');
  });

  it('should filter transcript segments by search query', () => {
    component.transcriptData.set(mockTranscript);
    component.transcriptSearch.set('key concepts');
    expect(component.filteredSegments().length).toBe(1);

    component.transcriptSearch.set('nonexistent query');
    expect(component.filteredSegments().length).toBe(0);
  });

  it('should toggle concept selection', () => {
    const concept = mockNotes.importantConcepts[0];
    component.selectConcept(concept);
    expect(component.selectedConcept()).toEqual(concept);

    component.selectConcept(concept);
    expect(component.selectedConcept()).toBeNull();
  });

  it('should reset state to home when resetToHome is called', () => {
    component.videoUrl.set('https://youtube.com');
    component.errorMessage.set('Some error');
    component.notes.set(mockNotes);

    component.resetToHome();

    expect(component.videoUrl()).toBe('');
    expect(component.errorMessage()).toBeNull();
    expect(component.notes()).toBeNull();
    expect(component.loading()).toBe(false);
    expect(component.activeTab()).toBe('transcript');
  });
});
