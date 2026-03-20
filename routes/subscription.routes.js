import express from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js';
import { cancelSubscription, createSubscription, getUserSubscription, pauseSubscription, resumeSubscription } from '../controllers/subscription.controller.js';

const router = express.Router();

router.post('/', authMiddleware, createSubscription);
router.get('/', authMiddleware, getUserSubscription);

router.put('/:id/pause', authMiddleware, pauseSubscription);
router.put('/:id/resume', authMiddleware, resumeSubscription);
router.put('/:id/cancel', authMiddleware, cancelSubscription);

export default router;