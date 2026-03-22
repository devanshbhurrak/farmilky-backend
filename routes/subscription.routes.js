import express from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/adminMiddleware.js';
import {
  cancelSubscription,
  createSubscription,
  getAllSubscriptions,
  getSubscriptionById,
  getTodaySupply,
  getUserSubscription,
  pauseSubscription,
  resumeSubscription,
  updateSubscriptionStatus,
} from '../controllers/subscription.controller.js';

const router = express.Router();

router.get('/admin/all', authMiddleware, adminOnly, getAllSubscriptions);
router.get('/admin/today-supply', authMiddleware, adminOnly, getTodaySupply);
router.put('/admin/:id/status', authMiddleware, adminOnly, updateSubscriptionStatus);

router.post('/', authMiddleware, createSubscription);
router.get('/', authMiddleware, getUserSubscription);
router.get('/:id', authMiddleware, getSubscriptionById);

router.put('/:id/pause', authMiddleware, pauseSubscription);
router.put('/:id/resume', authMiddleware, resumeSubscription);
router.put('/:id/cancel', authMiddleware, cancelSubscription);

export default router;
