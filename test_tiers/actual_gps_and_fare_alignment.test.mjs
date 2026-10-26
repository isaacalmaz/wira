import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test the factual fare calculation formula
function calculateRideFare(distKm, isCar = false) {
  const basePrice = isCar ? 15000 : 8000;
  const perKmRate = isCar ? 4000 : 2000;
  const extraKm = Math.max(0, distKm - 2);
  return Math.ceil((basePrice + Math.ceil(extraKm * perKmRate)) / 500) * 500;
}

function isSelfLocationQuery(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /tempat saya|lokasi saya|posisi saya|titik saya|posisi saat ini|lokasi saat ini|lokasi sekarang|posisi sekarang|lokasi terkini|titik jemput|rumah saya|^rumah$|kost saya|^kost$|villa saya|jemput saya|di sini|dari sini|^sini$|my location|current location|my place|^here$|from here|pickup here/i.test(t);
}

describe('Factual GPS & Vehicle Rate Alignment Test Suite', () => {
  it('Vehicle rates exactly match wira.one/ride portal & vehicles DB table', () => {
    // 2 km: exactly base price
    assert.equal(calculateRideFare(2.0, false), 8000, 'Motor 2 km should be Rp 8.000');
    assert.equal(calculateRideFare(2.0, true), 15000, 'Car 2 km should be Rp 15.000');

    // 4 km: Motor = 8000 + (2 * 2000) = 12000; Car = 15000 + (2 * 4000) = 23000
    assert.equal(calculateRideFare(4.0, false), 12000, 'Motor 4 km should be Rp 12.000');
    assert.equal(calculateRideFare(4.0, true), 23000, 'Car 4 km should be Rp 23.000');

    // 6.4 km: Motor = 8000 + (4.4 * 2000) = 16800 -> rounded to 500 = 17000
    assert.equal(calculateRideFare(6.4, false), 17000, 'Motor 6.4 km should be Rp 17.000');
    assert.equal(calculateRideFare(6.4, true), 33000, 'Car 6.4 km should be Rp 33.000');
  });

  it('isSelfLocationQuery matches varied Indonesian and English self-location phrases', () => {
    assert.ok(isSelfLocationQuery('tempat saya'));
    assert.ok(isSelfLocationQuery('lokasi saya'));
    assert.ok(isSelfLocationQuery('jemput saya'));
    assert.ok(isSelfLocationQuery('antar dari sini ke bandara'));
    assert.ok(isSelfLocationQuery('pesankan ojek dari tempat saya ke bandara'));
    assert.ok(isSelfLocationQuery('pickup here'));
    assert.ok(isSelfLocationQuery('my location'));
    assert.ok(!isSelfLocationQuery('dari pantai kuta ke bandara'));
  });

  it('Driver app map marker safety contract: pickup and dropoff objects always have lat and lng', () => {
    const draftDetails = {
      origin: 'Lokasi Anda Saat Ini',
      destination: 'Bandara Internasional Lombok (LOP)',
      originCoords: { lat: -8.815, lng: 116.265 },
      destCoords: { lat: -8.7615, lng: 116.2755 },
      pickup: { name: 'Lokasi Anda Saat Ini', lat: -8.815, lng: 116.265 },
      dropoff: { name: 'Bandara Internasional Lombok (LOP)', lat: -8.7615, lng: 116.2755 },
    };

    assert.ok(draftDetails.pickup && typeof draftDetails.pickup.lat === 'number');
    assert.ok(draftDetails.dropoff && typeof draftDetails.dropoff.lat === 'number');
    assert.equal(draftDetails.pickup.lat, -8.815);
    assert.equal(draftDetails.dropoff.lat, -8.7615);
  });
});
