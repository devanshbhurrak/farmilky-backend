import express from 'express'
import { authMiddleware } from '../middleware/authMiddleware.js';
import { adminOnly, deliveryPartnerOrAdmin } from '../middleware/adminMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import {
  cancelSubscription,
  createSubscription,
  createSubscriptionAdmin,
  getAllSubscriptions,
  getDeliveryBoard,
  markSubscriptionDeliveredToday,
  getSubscriptionById,
  getSubscriptionByIdAdmin,
  getTodaySupply,
  getUserSubscription,
  pauseSubscription,
  recordSubscriptionDeliveryOutcome,
  resumeSubscription,
  updateSubscriptionStatus,
  updateSubscriptionAdmin,
  updateSubscription,
  scheduleQuantityChange,
  cancelScheduledChange,
  scheduleVacation,
  cancelVacation,
  skipDeliveryDate,
  unskipDeliveryDate,
  bulkPauseSubscriptions,
  bulkResumeSubscriptions,
  getActiveSubscriptionsByUser,
} from '../controllers/subscription.controller.js';

const router = express.Router();

router.get('/admin/all', authMiddleware, adminOnly, getAllSubscriptions);
router.get('/admin/today-supply', authMiddleware, adminOnly, getTodaySupply);
router.get('/admin/delivery-board',       authMiddleware, deliveryPartnerOrAdmin, requirePermission("delivery_board.view"), getDeliveryBoard);
router.get('/admin/user/:userId/active',  authMiddleware, deliveryPartnerOrAdmin, requirePermission("customer.view_basic"), getActiveSubscriptionsByUser);
router.post('/admin/:id/delivery-outcome', authMiddleware, deliveryPartnerOrAdmin, requirePermission("delivery_board.view"), recordSubscriptionDeliveryOutcome);
router.post('/admin/:id/mark-delivered',   authMiddleware, deliveryPartnerOrAdmin, requirePermission("manifest.update"),     markSubscriptionDeliveredToday);
router.get('/admin/:id', authMiddleware, adminOnly, getSubscriptionByIdAdmin);
router.put('/admin/:id/status', authMiddleware, adminOnly, updateSubscriptionStatus);
router.post('/admin/create', authMiddleware, adminOnly, createSubscriptionAdmin);
router.put('/admin/:id', authMiddleware, adminOnly, updateSubscriptionAdmin);

router.post('/', authMiddleware, createSubscription);
router.get('/', authMiddleware, getUserSubscription);
router.get('/:id', authMiddleware, getSubscriptionById);

router.put('/:id/pause', authMiddleware, pauseSubscription);
router.put('/:id/resume', authMiddleware, resumeSubscription);
router.put('/:id/cancel', authMiddleware, cancelSubscription);
router.put('/:id/vacation', authMiddleware, scheduleVacation);
router.delete('/:id/vacation', authMiddleware, cancelVacation);
router.put('/:id/skip', authMiddleware, skipDeliveryDate);
router.put('/:id/unskip', authMiddleware, unskipDeliveryDate);
router.put('/:id/schedule-change', authMiddleware, scheduleQuantityChange);
router.delete('/:id/schedule-change', authMiddleware, cancelScheduledChange);
// General update — must be LAST to avoid catching specific /:id/xxx routes
router.put('/:id', authMiddleware, updateSubscription);

export default router;
