import { Router } from 'express';
import { generateNotes, fetchTranscript } from '../controllers/notes.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// POST /api/transcript
router.post('/transcript', asyncHandler(fetchTranscript));

// POST /api/generate-notes
router.post('/generate-notes', asyncHandler(generateNotes));

export default router;
