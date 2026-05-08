import express from 'express';
import {
  getNotifications,
  createNotification,
  notifyAll,
  markAsRead,
  getPriorityNotifications,
} from '../controllers/notificationController.js';

const router = express.Router();

router.get('/notifications', getNotifications);
router.get('/notifications/priority', getPriorityNotifications);
router.post('/notifications', createNotification);
router.post('/notifications/notify-all', notifyAll);
router.put('/notifications/:id/read', markAsRead);

export default router;
