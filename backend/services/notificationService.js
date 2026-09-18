const admin = require('../utils/firebaseAdmin');

/**
 * Send FCM Notification
 * @param {string} fcmToken - The device FCM token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data payload
 */
const sendPushNotification = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) return false;

  const message = {
    notification: {
      title,
      body,
    },
    data,
    token: fcmToken,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Successfully sent message:', response);
    return true;
  } catch (error) {
    console.error('Error sending message:', error);
    return false;
  }
};

module.exports = {
  sendPushNotification,
};
