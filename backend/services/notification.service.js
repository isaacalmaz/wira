const supabase = require('../config/supabase');
const whatsappService = require('./whatsapp.service');

class NotificationService {
  // Membuat notifikasi di database dan secara opsional mengirim via WA
  async createNotification(userId, title, message, sendWa = false, waPhone = null) {
    try {
      // 1. Simpan ke database
      await supabase.from('notifications').insert({
        user_id: userId,
        title,
        message,
        is_read: false
      });

      // 2. Kirim via WhatsApp jika diminta
      if (sendWa && waPhone) {
        await whatsappService.sendMessage(waPhone, `*Wira App: ${title}*\n\n${message}`);
      }

      return true;
    } catch (error) {
      console.error('Error membuat notifikasi:', error);
      return false;
    }
  }
}

module.exports = new NotificationService();
