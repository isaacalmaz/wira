const express = require('express');
const router = express.Router();
const { sendPushNotification } = require('../services/notificationService');

router.post('/send', async (req, res) => {
  const { fcmToken, title, body, data } = req.body;
  if (!fcmToken || !title) {
    return res.status(400).json({ error: 'fcmToken and title are required' });
  }

  const success = await sendPushNotification(fcmToken, title, body, data);
  if (success) {
    res.json({ message: 'Notification sent successfully' });
  } else {
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

module.exports = router;
