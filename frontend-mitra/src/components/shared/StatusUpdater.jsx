import { Button } from './UIComponents';
import { OrderStatus } from '../../constants/orderStatus';

const StatusUpdater = ({ currentStatus, role, onUpdate, isFoodDelivery = false }) => {
  let nextStatus = '';
  let buttonText = '';
  let variant = 'primary';

  if (role === 'driver') {
    if (currentStatus === OrderStatus.ACCEPTED) { nextStatus = OrderStatus.PICKING_UP; buttonText = 'Menuju Lokasi'; }
    else if (currentStatus === OrderStatus.PICKING_UP) { nextStatus = OrderStatus.IN_TRIP; buttonText = isFoodDelivery ? 'Sudah Ambil di Resto' : 'Sudah Di Jemput'; }
    else if (currentStatus === OrderStatus.IN_TRIP) { nextStatus = OrderStatus.COMPLETED; buttonText = 'Selesaikan Pesanan'; variant = 'success'; }
  } else if (role === 'merchant') {
    if (currentStatus === OrderStatus.ACCEPTED) { nextStatus = OrderStatus.PREPARING; buttonText = 'Mulai Siapkan'; }
    else if (currentStatus === OrderStatus.PREPARING) { nextStatus = OrderStatus.READY; buttonText = 'Siap Diambil'; variant = 'success'; }
  } else if (role === 'technician') {
    if (currentStatus === OrderStatus.ACCEPTED) { nextStatus = OrderStatus.ON_THE_WAY; buttonText = 'Menuju Lokasi'; }
    else if (currentStatus === OrderStatus.ON_THE_WAY) { nextStatus = OrderStatus.WORKING; buttonText = 'Mulai Bekerja'; }
    else if (currentStatus === OrderStatus.WORKING) { nextStatus = OrderStatus.COMPLETED; buttonText = 'Pekerjaan Selesai'; variant = 'success'; }
  }

  if (!nextStatus) return null;

  return (
    <Button variant={variant} className="w-full mt-2" onClick={() => onUpdate(nextStatus)}>
      {buttonText}
    </Button>
  );
};

export default StatusUpdater;
