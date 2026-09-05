// Layanan integrasi WhatsApp (Menggunakan WhatChimp atau sejenisnya)
const fetch = require('node-fetch');

class WhatsAppService {
  constructor() {
    this.apiKey = process.env.WHATCHHIMP_API_KEY;
    this.apiUrl = 'https://api.whatchimp.com/v1'; // URL contoh
  }

  // Mengirim pesan teks biasa
  async sendMessage(to, text) {
    console.log(`[Simulasi WA] Mengirim ke ${to}: ${text}`);
    return true; // Simulasi sukses
  }

  // Mengirim template pesan (misal untuk OTP)
  async sendTemplate(to, templateName, variables) {
    console.log(`[Simulasi WA Template] Mengirim template ${templateName} ke ${to} dengan data:`, variables);
    return true; // Simulasi sukses
  }

  // Menangani pesan masuk dari webhook
  handleIncoming(payload) {
    console.log('[Simulasi WA Masuk] Menerima pesan:', payload);
    // Logika balasan otomatis bisa ditambahkan di sini
    return true;
  }
}

module.exports = new WhatsAppService();
