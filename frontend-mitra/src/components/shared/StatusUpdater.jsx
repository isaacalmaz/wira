import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '../ui';
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
    // The kit has no green button: the brand primary carries every step,
    // and the final ("success") step is marked with a check icon instead.
    <Button
      variant="primary"
      size="lg"
      block
      className="mt-2"
      leftIcon={variant === 'success' ? <CheckCircle2 size={19} /> : undefined}
      rightIcon={variant === 'success' ? undefined : <ArrowRight size={18} />}
      onClick={() => onUpdate(nextStatus)}
    >
      {buttonText}
    </Button>
  );
};

export default StatusUpdater;
