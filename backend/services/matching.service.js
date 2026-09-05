class MatchingService {
  // Simulasi mencari driver (Delay buatan)
  async findDriver(orderId, location) {
    return new Promise((resolve) => {
      console.log(`Mencari driver untuk pesanan ${orderId}...`);
      
      // Delay simulasi 3 detik
      setTimeout(() => {
        const mockDriver = {
          id: 'driver-' + Math.floor(Math.random() * 1000),
          name: 'Budi (Driver Simulasi)',
          phone: '081234567890',
          vehicle_plate: 'DR 1234 XX',
          rating: 4.8
        };
        console.log(`Driver ditemukan: ${mockDriver.name}`);
        resolve(mockDriver);
      }, 3000);
    });
  }

  // Simulasi mencari teknisi
  async findTechnician(orderId, category) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockTech = {
          id: 'tech-' + Math.floor(Math.random() * 1000),
          name: 'Agus (Teknisi Simulasi)',
          category: category,
          rating: 4.9
        };
        resolve(mockTech);
      }, 2000);
    });
  }
}

module.exports = new MatchingService();
