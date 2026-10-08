// Projects (migrations/0093): shared constants for the customer pages.
export const PROJECT_AREAS = ['Mataram', 'Lombok Barat', 'Senggigi', 'Lombok Utara', 'Gili', 'Lombok Tengah', 'Kuta Mandalika', 'Lombok Timur'];

export const PROJECT_STATUS_TONE = { open: 'warning', awarded: 'brand', completed: 'success', cancelled: 'danger', expired: 'neutral' };
export const STAGE_STATUS_TONE = { pending: 'neutral', funded: 'brand', submitted: 'warning', released: 'success', refunded: 'neutral', disputed: 'danger' };

export { formatDate } from '../../utils/formatDate';
