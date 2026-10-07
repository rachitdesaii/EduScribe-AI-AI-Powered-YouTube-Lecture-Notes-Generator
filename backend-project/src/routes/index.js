import { Router } from 'express';
import healthRoutes from './health.routes.js';
import notesRoutes from './notes.routes.js';

const router = Router();

// Mount feature routers here. As the app grows, add more lines like:
// router.use('/users', userRoutes);
// router.use('/auth', authRoutes);
router.use('/health', healthRoutes);

// notesRoutes defines the path itself (POST /generate-notes),
// so it's mounted at the root of this router -> final path: /api/generate-notes
router.use('/', notesRoutes);

export default router;
