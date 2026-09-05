import React from 'react';
import { Button } from './UIComponents';

const StatusUpdater = ({ currentStatus, role, onUpdate }) => {
  let nextStatus = '';
  let buttonText = '';
  let variant = 'primary';

  if (role === 'driver') {
    if (currentStatus === 'Active') { nextStatus = 'Pick Up'; buttonText = 'Menuju Lokasi'; }
    else if (currentStatus === 'Pick Up') { nextStatus = 'On The Way'; buttonText = 'Sudah Di Jemput'; }
    else if (currentStatus === 'On The Way') { nextStatus = 'Arrived'; buttonText = 'Tiba di Tujuan'; }
    else if (currentStatus === 'Arrived') { nextStatus = 'Completed'; buttonText = 'Selesaikan Pesanan'; variant = 'success'; }
  } else if (role === 'merchant') {
    if (currentStatus === 'Incoming') { nextStatus = 'Preparing'; buttonText = 'Terima & Siapkan'; }
    else if (currentStatus === 'Preparing') { nextStatus = 'Ready'; buttonText = 'Siap Diambil'; variant = 'success'; }
  } else if (role === 'technician') {
    if (currentStatus === 'Incoming') { nextStatus = 'Accepted'; buttonText = 'Terima Pekerjaan'; }
    else if (currentStatus === 'Accepted') { nextStatus = 'On The Way'; buttonText = 'Menuju Lokasi'; }
    else if (currentStatus === 'On The Way') { nextStatus = 'Working'; buttonText = 'Mulai Bekerja'; }
    else if (currentStatus === 'Working') { nextStatus = 'Completed'; buttonText = 'Pekerjaan Selesai'; variant = 'success'; }
  }

  if (!nextStatus) return null;

  return (
    <Button variant={variant} className="w-full mt-2" onClick={() => onUpdate(nextStatus)}>
      {buttonText}
    </Button>
  );
};

export default StatusUpdater;
